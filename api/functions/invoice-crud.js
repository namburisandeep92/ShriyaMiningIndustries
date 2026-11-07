/**
 * Invoice CRUD Handlers
 * POST /api/invoices - Create invoice
 * GET /api/invoices - List invoices
 * GET /api/invoices/:id - Get single invoice
 * PATCH /api/invoices/:id - Update invoice
 * DELETE /api/invoices/:id - Delete invoice
 */

import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import * as invoiceUtils from '../services/invoice-utils.js';

/**
 * POST /api/invoices
 * Create new invoice with auto-numbering
 */
const handleCreateInvoice = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { vendorId, buyerId, items, notes } = req.body;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.create')) {
    throw Errors.Forbidden('create invoice');
  }

  // Validate input
  if (!vendorId || !buyerId || !Array.isArray(items) || items.length === 0) {
    throw Errors.InvalidInput('vendorId, buyerId, and items[] are required');
  }

  // Validate and calculate line amounts
  let totalAmount = 0;
  const validatedItems = items.map((item, idx) => {
    if (!item.description || item.quantity == null || item.rate == null) {
      throw Errors.InvalidInput(
        `Item ${idx + 1}: description, quantity, and rate are required`
      );
    }

    const quantity = parseFloat(item.quantity);
    const rate = parseFloat(item.rate);
    const taxRate = parseFloat(item.taxRate || 0);

    if (quantity <= 0 || rate < 0) {
      throw Errors.InvalidInput(`Item ${idx + 1}: invalid quantity or rate`);
    }

    const lineAmount = invoiceUtils.calculateLineAmount(quantity, rate);
    const tax = invoiceUtils.calculateTax(lineAmount, taxRate);

    totalAmount += lineAmount + tax;

    return {
      description: item.description,
      quantity,
      rate,
      lineAmount,
      taxRate,
      tax,
    };
  });

  // Insert via stored procedure
  const db = getDatabase();
  const result = await db.execute('usp_Invoice_Create', {
    correlationId,
    vendorId,
    buyerId,
    itemsJson: JSON.stringify(validatedItems),
    notes: notes || null,
    createdByEmail: req.user.email,
  });

  if (!result.recordset || result.recordset.length === 0) {
    throw Errors.DatabaseError('Failed to create invoice');
  }

  const invoice = result.recordset[0];

  res.status(201).json({
    invoiceId: invoice.InvoiceId,
    invoiceNumber: invoice.InvoiceNumber,
    vendorId,
    buyerId,
    status: 'draft',
    totalAmount,
    rowVersion: invoice.RowVersion,
    createdOn: invoice.CreatedOn,
    createdBy: req.user.email,
  });
});

/**
 * GET /api/invoices
 * List invoices with filtering and paging
 */
const handleListInvoices = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const {
    status,
    vendorId,
    buyerId,
    page = 1,
    pageSize = 50,
    sortBy = 'CreatedOn',
    sortOrder = 'desc',
  } = req.query;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.read')) {
    throw Errors.Forbidden('list invoices');
  }

  // Validate paging
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSz = Math.min(100, Math.max(1, parseInt(pageSize) || 50));

  const db = getDatabase();
  const result = await db.execute('usp_Invoice_GetList', {
    correlationId,
    status: status || null,
    vendorId: vendorId || null,
    buyerId: buyerId || null,
    pageNum,
    pageSize: pageSz,
    sortBy,
    sortOrder,
  });

  if (!result.recordset) {
    throw Errors.DatabaseError('Failed to retrieve invoices');
  }

  const invoices = result.recordset.filter(r => r.InvoiceId);
  const totalCount = result.recordset.find(r => r.TotalCount)?.TotalCount || 0;

  res.json({
    invoices: invoices.map(inv => ({
      invoiceId: inv.InvoiceId,
      invoiceNumber: inv.InvoiceNumber,
      vendorId: inv.VendorId,
      buyerId: inv.BuyerId,
      status: inv.Status,
      totalAmount: inv.TotalAmount,
      createdOn: inv.CreatedOn,
      createdBy: inv.CreatedBy,
    })),
    pagination: {
      page: pageNum,
      pageSize: pageSz,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSz),
    },
  });
});

/**
 * GET /api/invoices/:id
 * Get single invoice with all details
 */
const handleGetInvoice = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { id: invoiceId } = req.params;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.read')) {
    throw Errors.Forbidden('view invoice');
  }

  if (!invoiceId) {
    throw Errors.InvalidInput('invoiceId is required');
  }

  const db = getDatabase();
  const result = await db.execute('usp_Invoice_GetById', {
    correlationId,
    invoiceId,
  });

  if (!result.recordset || result.recordset.length === 0) {
    throw Errors.NotFound('Invoice');
  }

  const invoice = result.recordset[0];
  const items = result.recordset.filter(r => r.LineId);

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.LineAmount || 0), 0);
  const tax = items.reduce((sum, item) => sum + (item.Tax || 0), 0);

  res.json({
    invoiceId: invoice.InvoiceId,
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
    rowVersion: invoice.RowVersion,
    createdOn: invoice.CreatedOn,
    createdBy: invoice.CreatedBy,
    modifiedOn: invoice.ModifiedOn,
    modifiedBy: invoice.ModifiedBy,
  });
});

/**
 * PATCH /api/invoices/:id
 * Update invoice with optimistic concurrency control
 * 409 Conflict if rowVersion doesn't match
 */
const handleUpdateInvoice = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { id: invoiceId } = req.params;
  const { items, status, notes, rowVersion } = req.body;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.update')) {
    throw Errors.Forbidden('edit invoice');
  }

  if (!invoiceId) {
    throw Errors.InvalidInput('invoiceId is required');
  }

  if (!rowVersion) {
    throw Errors.InvalidInput(
      'rowVersion is required (for concurrency control). Send If-Match header with current rowVersion.'
    );
  }

  // Validate items if provided
  let validatedItems = null;
  if (items && Array.isArray(items)) {
    validatedItems = items.map((item, idx) => {
      if (!item.description || item.quantity == null || item.rate == null) {
        throw Errors.InvalidInput(
          `Item ${idx + 1}: description, quantity, and rate are required`
        );
      }

      const quantity = parseFloat(item.quantity);
      const rate = parseFloat(item.rate);
      const taxRate = parseFloat(item.taxRate || 0);

      if (quantity <= 0 || rate < 0) {
        throw Errors.InvalidInput(`Item ${idx + 1}: invalid quantity or rate`);
      }

      const lineAmount = invoiceUtils.calculateLineAmount(quantity, rate);
      const tax = invoiceUtils.calculateTax(lineAmount, taxRate);

      return {
        description: item.description,
        quantity,
        rate,
        lineAmount,
        taxRate,
        tax,
      };
    });
  }

  const db = getDatabase();
  const result = await db.execute('usp_Invoice_Update', {
    correlationId,
    invoiceId,
    itemsJson: validatedItems ? JSON.stringify(validatedItems) : null,
    status: status || null,
    notes: notes || null,
    currentRowVersion: rowVersion,
    modifiedByEmail: req.user.email,
  });

  // Check for concurrency conflict (409)
  if (result.returnValue === 409 || result.rowsAffected === 0) {
    // Get current version for client
    const currentResult = await db.execute('usp_Invoice_GetById', {
      correlationId,
      invoiceId,
    });

    const currentInvoice = currentResult.recordset[0];

    throw Errors.Conflict(
      `This invoice has been modified by another user. Please refresh and try again.`
    );
  }

  if (!result.recordset || result.recordset.length === 0) {
    throw Errors.DatabaseError('Failed to update invoice');
  }

  const updated = result.recordset[0];

  res.json({
    invoiceId: updated.InvoiceId,
    invoiceNumber: updated.InvoiceNumber,
    status: updated.Status,
    rowVersion: updated.RowVersion,
    modifiedOn: updated.ModifiedOn,
    modifiedBy: req.user.email,
  });
});

/**
 * DELETE /api/invoices/:id
 * Soft delete invoice
 */
const handleDeleteInvoice = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { id: invoiceId } = req.params;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.delete')) {
    throw Errors.Forbidden('delete invoice');
  }

  if (!invoiceId) {
    throw Errors.InvalidInput('invoiceId is required');
  }

  const db = getDatabase();
  await db.execute('usp_Invoice_Delete', {
    correlationId,
    invoiceId,
    deletedByEmail: req.user.email,
  });

  res.status(204).send();
});

export {
  handleCreateInvoice,
  handleListInvoices,
  handleGetInvoice,
  handleUpdateInvoice,
  handleDeleteInvoice,
};
