import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import { invoiceId, invoiceResponse, invoiceStatus, pagedResponse, paging, positiveInteger, rowVersion, validateItems } from '../services/api-contracts.js';

function requirePermission(req, permission) {
  if (!req.user?.permissions?.includes(permission)) throw Errors.Forbidden(permission);
}

const handleCreateInvoice = asyncHandler(async (req, res) => {
  requirePermission(req, 'invoice.create');
  const { vendorId, buyerId, notes, poNumber } = req.body;
  const date = new Date(req.body.invoiceDate);
  if (Number.isNaN(date.getTime())) throw Errors.InvalidInput('invoiceDate must be a valid date');
  const result = await getDatabase().execute('app.usp_Invoice_Create', {
    correlationId: req.correlationId, vendorId: positiveInteger(vendorId, 'vendorId'),
    buyerId: positiveInteger(buyerId, 'buyerId'), invoiceDate: date,
    itemsJson: JSON.stringify(validateItems(req.body.items ?? req.body.lineItems)),
    notes: notes ?? null, poNumber: poNumber || null, createdByEmail: req.user.email,
  });
  if (!result.recordset[0]) throw Errors.DatabaseError('Invoice creation returned no data');
  res.status(201).json(invoiceResponse(result.recordset[0], result.recordsets[1]));
});

const handleListInvoices = asyncHandler(async (req, res) => {
  requirePermission(req, 'invoice.read');
  const { pageNum, pageSize } = paging(req.query);
  const sortBy = req.query.sortBy || 'CreatedOn';
  const sortOrder = req.query.sortOrder || 'desc';
  if (!['CreatedOn', 'InvoiceNumber', 'TotalAmount'].includes(sortBy) || !['asc', 'desc'].includes(sortOrder)) {
    throw Errors.InvalidInput('Invalid sort parameters');
  }
  const result = await getDatabase().execute('app.usp_Invoice_GetList', {
    correlationId: req.correlationId, pageNum, pageSize, sortBy, sortOrder,
    status: invoiceStatus(req.query.status), search: req.query.search || null,
    vendorId: req.query.vendorId ? positiveInteger(req.query.vendorId, 'vendorId') : null,
    buyerId: req.query.buyerId ? positiveInteger(req.query.buyerId, 'buyerId') : null,
  });
  res.json({ invoices: result.recordset.map(header => invoiceResponse(header)), ...pagedResponse(result, pageNum, pageSize) });
});

const handleGetInvoice = asyncHandler(async (req, res) => {
  requirePermission(req, 'invoice.read');
  const result = await getDatabase().execute('app.usp_Invoice_GetById', {
    correlationId: req.correlationId, invoiceId: invoiceId(req.params.id),
  });
  if (!result.recordset[0]) throw Errors.NotFound('Invoice');
  res.json(invoiceResponse(result.recordset[0], result.recordsets[1]));
});

const handleUpdateInvoice = asyncHandler(async (req, res) => {
  requirePermission(req, 'invoice.update');
  const status = invoiceStatus(req.body.status);
  if (status === 'Approved' && !req.user.permissions.includes('invoice.approve')) {
    throw Errors.Forbidden('approve invoices');
  }
  const items = req.body.items ?? req.body.lineItems;
  const result = await getDatabase().execute('app.usp_Invoice_Update', {
    correlationId: req.correlationId, invoiceId: invoiceId(req.params.id),
    currentRowVersion: rowVersion(req.body.rowVersion ?? req.headers['x-row-version']),
    itemsJson: items == null ? null : JSON.stringify(validateItems(items)),
    status, notes: req.body.notes ?? null, notesProvided: Object.hasOwn(req.body, 'notes'),
    modifiedByEmail: req.user.email,
  });
  if (!result.recordset[0]) throw Errors.DatabaseError('Invoice update returned no data');
  res.json(invoiceResponse(result.recordset[0], result.recordsets[1]));
});

const handleDeleteInvoice = asyncHandler(async (req, res) => {
  requirePermission(req, 'invoice.delete');
  await getDatabase().execute('app.usp_Invoice_Delete', {
    correlationId: req.correlationId, invoiceId: invoiceId(req.params.id), deletedByEmail: req.user.email,
  });
  res.status(204).end();
});

export { handleCreateInvoice, handleListInvoices, handleGetInvoice, handleUpdateInvoice, handleDeleteInvoice };
