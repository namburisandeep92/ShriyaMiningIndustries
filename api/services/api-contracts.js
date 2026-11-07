import { Errors } from '../middleware/error-handler.js';

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
  const items = lines.map(line => ({
    lineId: line.LineId, description: line.Description, quantity: line.Quantity,
    rate: line.Rate, unitPrice: line.Rate, lineAmount: line.LineAmount,
    taxRate: line.TaxRate, taxPercent: line.TaxRate, tax: line.Tax, unitOfMeasure: line.UnitOfMeasure,
  }));
  return {
    id: header.InvoiceId, invoiceId: header.InvoiceId, invoiceNumber: header.InvoiceNumber,
    invoiceDate: header.InvoiceDate, poNumber: header.PONumber,
    vendorId: header.VendorId, buyerId: header.BuyerId, vendorName: header.VendorName, buyerName: header.BuyerName,
    status: header.Status.toLowerCase(), notes: header.Notes, version: header.Version,
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
