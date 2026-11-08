import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import { companyProfileResponse, invoiceId, invoiceResponse, invoiceStatus, legacyInvoiceInput, pagedResponse, paging, positiveInteger, rowVersion, validateItems } from '../services/api-contracts.js';
import { applyCompanyProfileDefaults } from '../services/legacy-invoice.js';

function requirePermission(req, permission) {
  if (!req.user?.permissions?.includes(permission)) throw Errors.Forbidden(permission);
}

async function getActiveCompanyProfile() {
  const [profile] = await getDatabase().query(`
    SELECT TOP (1) LegalName, AddressLine1, AddressLine2, AddressLine3, CountryOfOrigin,
      PreCarriageBy, PlaceOfReceipt, PortOfLoading, Packing, Grade, DeclarationText,
      AuthorisedSignatoryLabel, City, District, State, PINCode, Country, Phone, Email, Website,
      GSTIN, IEC, PAN, LUTARN, BankName, BankBranch, AccountNumber, IFSC, SWIFT
    FROM app.Vendor WHERE IsDeleted = 0 ORDER BY VendorId
  `);
  if (!profile) throw Errors.DatabaseError('The company profile is not configured');
  return companyProfileResponse(profile);
}

const handleCreateInvoice = asyncHandler(async (req, res) => {
  requirePermission(req, 'invoice.create');
  const { buyerId, notes, poNumber } = req.body;
  let legacy = null;
  if (req.body.document) {
    const companyDefaults = applyCompanyProfileDefaults(req.body.document, await getActiveCompanyProfile());
    for (const key of ['Country of origin', 'Pre-carriage by', 'Place of receipt', 'Port of loading', 'Packing', 'Grade']) {
      if (typeof req.body.document.header?.[key] === 'string') companyDefaults.header[key] = req.body.document.header[key];
    }
    legacy = legacyInvoiceInput(companyDefaults);
  }
  const date = legacy?.invoiceDate || new Date(req.body.invoiceDate);
  if (Number.isNaN(date.getTime())) throw Errors.InvalidInput('invoiceDate must be a valid date');
  const result = await getDatabase().execute('app.usp_Invoice_Create', {
    correlationId: req.correlationId, buyerId: positiveInteger(buyerId, 'buyerId'), invoiceDate: date,
    itemsJson: JSON.stringify(validateItems(legacy?.items ?? req.body.items ?? req.body.lineItems)),
    notes: notes ?? null, poNumber: legacy?.poNumber ?? (poNumber || null), createdByEmail: req.user.email,
    ...(legacy && { documentJson: legacy.documentJson, requestedInvoiceNumber: legacy.requestedInvoiceNumber }),
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
  let legacy = null;
  if (req.body.document) {
    const current = await getDatabase().execute('app.usp_Invoice_GetById', { invoiceId: invoiceId(req.params.id) });
    if (!current.recordset[0]) throw Errors.NotFound('Invoice');
    const submittedDocument = { ...req.body.document, header: { ...req.body.document.header } };
    if (current.recordset[0].DocumentJson) {
      const savedDocument = JSON.parse(current.recordset[0].DocumentJson);
      submittedDocument.header.Exporter = savedDocument.header.Exporter;
      submittedDocument.declarationText = savedDocument.declarationText
        ?? 'We declare that this Invoice shows the actual price of the goods described and that all particulars are true and correct.';
      submittedDocument.authorisedSignatoryLabel = savedDocument.authorisedSignatoryLabel ?? 'Authorised Signatory';
    } else {
      Object.assign(submittedDocument, applyCompanyProfileDefaults(submittedDocument, await getActiveCompanyProfile()));
    }
    legacy = legacyInvoiceInput(submittedDocument);
  }
  if (items != null && !legacy) {
    const current = await getDatabase().execute('app.usp_Invoice_GetById', { invoiceId: invoiceId(req.params.id) });
    if (!current.recordset[0]) throw Errors.NotFound('Invoice');
    if (current.recordset[0].DocumentJson) throw Errors.InvalidInput('Edit this invoice through the PO invoice editor to preserve its document');
  }
  const result = await getDatabase().execute('app.usp_Invoice_Update', {
    correlationId: req.correlationId, invoiceId: invoiceId(req.params.id),
    currentRowVersion: rowVersion(req.body.rowVersion ?? req.headers['x-row-version']),
    itemsJson: legacy ? JSON.stringify(validateItems(legacy.items)) : items == null ? null : JSON.stringify(validateItems(items)),
    status, notes: req.body.notes ?? null, notesProvided: Object.hasOwn(req.body, 'notes'),
    modifiedByEmail: req.user.email,
    ...(legacy && { documentJson: legacy.documentJson, invoiceDate: legacy.invoiceDate,
      poNumber: legacy.poNumber, requestedInvoiceNumber: legacy.requestedInvoiceNumber }),
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
