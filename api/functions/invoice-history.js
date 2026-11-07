/**
 * Invoice History Handler
 * GET /api/invoices/:id/versions - List all versions
 * GET /api/invoices/:id/versions/:version - Get specific version
 */

import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';

/**
 * GET /api/invoices/:id/versions
 * List all versions of an invoice
 */
const handleListVersions = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { id: invoiceId } = req.params;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.read')) {
    throw Errors.Forbidden('view invoice history');
  }

  if (!invoiceId) {
    throw Errors.InvalidInput('invoiceId is required');
  }

  const db = getDatabase();
  const result = await db.execute('usp_Invoice_GetHistory', {
    correlationId,
    invoiceId,
  });

  if (!result.recordset || result.recordset.length === 0) {
    throw Errors.NotFound('Invoice history');
  }

  const versions = result.recordset.filter(r => r.Version);

  res.json({
    invoiceId,
    invoiceNumber: versions[0]?.InvoiceNumber,
    versions: versions.map(v => ({
      version: v.Version,
      status: v.Status,
      totalAmount: v.TotalAmount,
      modifiedOn: v.ModifiedOn,
      modifiedBy: v.ModifiedBy,
      changeDescription: v.ChangeDescription,
    })),
  });
});

/**
 * GET /api/invoices/:id/versions/:version
 * Get specific version of an invoice for reprinting or review
 */
const handleGetVersion = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { id: invoiceId, version } = req.params;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.read')) {
    throw Errors.Forbidden('view invoice version');
  }

  if (!invoiceId || !version) {
    throw Errors.InvalidInput('invoiceId and version are required');
  }

  const versionNum = parseInt(version);
  if (isNaN(versionNum) || versionNum < 1) {
    throw Errors.InvalidInput('version must be a positive integer');
  }

  const db = getDatabase();
  const result = await db.execute('usp_Invoice_GetVersion', {
    correlationId,
    invoiceId,
    version: versionNum,
  });

  if (!result.recordset || result.recordset.length === 0) {
    throw Errors.NotFound(`Invoice version ${versionNum}`);
  }

  const invoice = result.recordset[0];
  const items = result.recordset.filter(r => r.LineId);

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.LineAmount || 0), 0);
  const tax = items.reduce((sum, item) => sum + (item.Tax || 0), 0);

  res.json({
    version: versionNum,
    invoiceId,
    invoiceNumber: invoice.InvoiceNumber,
    vendorId: invoice.VendorId,
    buyerId: invoice.BuyerId,
    items: items.map(item => ({
      lineId: item.LineId,
      description: item.Description,
      quantity: item.Quantity,
      rate: item.Rate,
      lineAmount: item.LineAmount,
      taxRate: item.TaxRate,
      tax: item.Tax,
    })),
    totals: {
      subtotal,
      tax,
      total: subtotal + tax,
    },
    status: invoice.Status,
    notes: invoice.Notes,
    modifiedOn: invoice.ModifiedOn,
    modifiedBy: invoice.ModifiedBy,
    versionNote: `This is version ${versionNum} of invoice ${invoice.InvoiceNumber}. Last modified by ${invoice.ModifiedBy} on ${invoice.ModifiedOn}.`,
  });
});

export {
  handleListVersions,
  handleGetVersion,
};
