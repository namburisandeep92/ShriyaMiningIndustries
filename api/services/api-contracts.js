import { ApiError, Errors } from '../middleware/error-handler.js';
import { cleanHsnCode, goodsCategories, validateLegacyInvoice } from './legacy-invoice.js';

const companyProfileFields = [
  'legalName', 'addressLine1', 'addressLine2', 'addressLine3', 'city', 'district', 'state',
  'pinCode', 'country', 'phone', 'email', 'website', 'gstin', 'iec', 'pan', 'lutArn',
  'bankName', 'bankBranch', 'accountNumber', 'ifsc', 'swift', 'countryOfOrigin',
  'preCarriageBy', 'placeOfReceipt', 'portOfLoading', 'packing', 'grade', 'declarationText',
  'authorisedSignatoryLabel',
];
const uppercaseCompanyFields = new Set(['gstin', 'iec', 'ifsc']);
const companyFieldLengths = {
  legalName: 255, addressLine1: 255, addressLine2: 255, addressLine3: 255,
  city: 100, district: 100, state: 100, pinCode: 20, country: 100,
  phone: 20, email: 255, website: 255, gstin: 50, iec: 50, pan: 50,
  lutArn: 100, bankName: 255, bankBranch: 255, accountNumber: 100,
  ifsc: 50, swift: 50, countryOfOrigin: 100, preCarriageBy: 100,
  placeOfReceipt: 100, portOfLoading: 100, packing: 100, grade: 100,
  authorisedSignatoryLabel: 255,
};

export function companyProfileInput(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw Errors.InvalidInput('Company profile must be an object');
  }
  const profile = Object.fromEntries(companyProfileFields.map(field => {
    const raw = value[field];
    if (raw != null && typeof raw !== 'string') throw Errors.InvalidInput(`${field} must be text`);
    const normalized = typeof raw === 'string' ? raw.trim() : null;
    if (normalized && companyFieldLengths[field] && normalized.length > companyFieldLengths[field]) {
      throw Errors.InvalidInput(`${field} must not exceed ${companyFieldLengths[field]} characters`);
    }
    return [field, normalized ? (uppercaseCompanyFields.has(field) ? normalized.toUpperCase() : normalized) : null];
  }));
  if (!profile.legalName) throw Errors.InvalidInput('legalName is required');
  if (!profile.addressLine1) throw Errors.InvalidInput('addressLine1 is required');
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    throw Errors.InvalidInput('email must be a valid email address');
  }
  return profile;
}

export function companyProfileResponse(row) {
  return {
    legalName: row.LegalName,
    addressLine1: row.AddressLine1,
    addressLine2: row.AddressLine2,
    addressLine3: row.AddressLine3,
    city: row.City,
    district: row.District,
    state: row.State,
    pinCode: row.PINCode,
    country: row.Country,
    phone: row.Phone,
    email: row.Email,
    website: row.Website,
    gstin: row.GSTIN,
    iec: row.IEC,
    pan: row.PAN,
    lutArn: row.LUTARN,
    bankName: row.BankName,
    bankBranch: row.BankBranch,
    accountNumber: row.AccountNumber,
    ifsc: row.IFSC,
    swift: row.SWIFT,
    countryOfOrigin: row.CountryOfOrigin,
    preCarriageBy: row.PreCarriageBy,
    placeOfReceipt: row.PlaceOfReceipt,
    portOfLoading: row.PortOfLoading,
    packing: row.Packing,
    grade: row.Grade,
    declarationText: row.DeclarationText,
    authorisedSignatoryLabel: row.AuthorisedSignatoryLabel,
  };
}

export function legacyInvoiceInput(document) {
  const issues = validateLegacyInvoice(document);
  if (issues.length) throw new ApiError(400, 'INV-VALIDATE-400', issues.map(issue => issue.message).join('; '), issues);
  const normalizedDocument = {
    ...document,
    hsnCodes: Object.fromEntries(goodsCategories(document.lines).map(category => [
      category,
      cleanHsnCode(document.hsnCodes && Object.prototype.hasOwnProperty.call(document.hsnCodes, category)
        ? document.hsnCodes[category] : document.lines.find(line => line.kind === category)?.hsnCode),
    ])),
    lines: document.lines.map(line => {
      const { net, gross, ...normalizedLine } = line;
      normalizedLine.weight = line.weight ?? net ?? gross ?? '';
      delete normalizedLine.hsnCode;
      return normalizedLine;
    }),
  };
  delete normalizedDocument.knownHsnCodes;
  return {
    documentJson: JSON.stringify(normalizedDocument),
    requestedInvoiceNumber: document.header['Invoice no'].trim(),
    invoiceDate: new Date(document.header['Invoice date']),
    poNumber: document.header['Buyer PO nos'] || null,
    items: document.lines.map(line => ({
      description: `${line.stone} ${line.finish} ${line.size}\n${line.ref}`.trim() || 'Invoice line',
      quantity: Number(line.qty), rate: Number(line.rate), taxRate: 0, unitOfMeasure: line.uom,
    })),
  };
}

export function positiveInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw Errors.InvalidInput(`${name} must be a positive integer no greater than ${maximum}`);
  }
  return number;
}

export function paging(query) {
  return {
    pageNum: positiveInteger(query.page ?? 1, 'page'),
    pageSize: positiveInteger(query.pageSize ?? 50, 'pageSize', 100),
  };
}

export function invoiceId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw Errors.InvalidInput('invoiceId must be a UUID');
  }
  return value;
}

const statuses = { draft: 'Draft', 'in review': 'In Review', approved: 'Approved', shipped: 'Shipped' };
export function invoiceStatus(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !statuses[value.toLowerCase()]) throw Errors.InvalidInput('Invalid invoice status');
  return statuses[value.toLowerCase()];
}

export function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 1000) throw Errors.InvalidInput('Between 1 and 1000 invoice items are required');
  return items.map((item, index) => {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) throw Errors.InvalidInput(`Invalid invoice item ${index + 1}`);
    const quantity = Number(item.quantity);
    const rate = Number(item.rate ?? item.unitPrice);
    const taxRate = Number(item.taxRate ?? item.taxPercent ?? 0);
    if (typeof item.description !== 'string' || !item.description.trim()
        || item.quantity == null || (item.rate == null && item.unitPrice == null)
        || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(rate) || rate < 0
        || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100
        || quantity > 999999999999999 || rate > 999999999999999
        || (item.unitOfMeasure != null && (typeof item.unitOfMeasure !== 'string' || !item.unitOfMeasure.trim() || item.unitOfMeasure.length > 10))) {
      throw Errors.InvalidInput(`Invalid invoice item ${index + 1}`);
    }
    return { description: item.description.trim(), quantity, rate, taxRate, unitOfMeasure: item.unitOfMeasure || 'SF' };
  });
}

export function rowVersion(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{16}$/i.test(value)) {
    throw Errors.InvalidInput('rowVersion must be the 16-character hexadecimal token returned by the API');
  }
  return Buffer.from(value, 'hex');
}

export function invoiceResponse(header, lines = []) {
  const document = header.DocumentJson ? JSON.parse(header.DocumentJson) : undefined;
  const documentExporter = typeof document?.header?.Exporter === 'string'
    ? document.header.Exporter.split(/\r?\n/, 1)[0] : null;
  const items = lines.map(line => ({
    lineId: line.LineId, description: line.Description, quantity: line.Quantity,
    rate: line.Rate, unitPrice: line.Rate, lineAmount: line.LineAmount,
    taxRate: line.TaxRate, taxPercent: line.TaxRate, tax: line.Tax, unitOfMeasure: line.UnitOfMeasure,
  }));
  return {
    id: header.InvoiceId, invoiceId: header.InvoiceId, invoiceNumber: header.InvoiceNumber,
    invoiceDate: header.InvoiceDate, poNumber: header.PONumber,
    vendorId: header.VendorId, buyerId: header.BuyerId, vendorName: documentExporter || header.VendorName, buyerName: header.BuyerName,
    status: header.Status.toLowerCase(), notes: header.Notes, version: header.Version,
    document,
    totalAmount: header.FinalAmount, items, lineItems: items,
    totals: { subtotal: header.TotalAmount, tax: header.TaxAmount, total: header.FinalAmount },
    rowVersion: Buffer.isBuffer(header.RowVersion) ? header.RowVersion.toString('hex') : undefined,
    createdOn: header.CreatedOn, createdAt: header.CreatedOn, createdBy: header.CreatedBy,
    modifiedOn: header.ModifiedOn, modifiedAt: header.ModifiedOn, modifiedBy: header.ModifiedBy,
  };
}

export function pagedResponse(result, pageNum, pageSize) {
  const total = result.recordsets[1]?.[0]?.TotalCount;
  if (!Number.isInteger(total) || total < 0) throw Errors.DatabaseError('Missing pagination metadata');
  return { total, pagination: { page: pageNum, pageSize, totalCount: total, totalPages: Math.ceil(total / pageSize) } };
}
