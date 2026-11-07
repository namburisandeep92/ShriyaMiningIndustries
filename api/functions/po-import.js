import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import { paging, pagedResponse, positiveInteger, validateItems } from '../services/api-contracts.js';
import ExcelJS from 'exceljs';

const REQUIRED_COLUMNS = ['Line Number', 'Product Code', 'Description', 'Quantity', 'Unit Rate', 'Tax Rate'];

const handleUploadPO = asyncHandler(async (req, res) => {
  if (!req.user.permissions.includes('file.upload')) throw Errors.Forbidden('upload PO');
  const { vendorId, poNumber, file, fileName } = req.body;
  const vendor = positiveInteger(vendorId, 'vendorId');
  if (typeof poNumber !== 'string' || !poNumber.trim() || poNumber.length > 50) throw Errors.InvalidInput('Valid poNumber is required');
  if (typeof fileName !== 'string' || !/\.xlsx$/i.test(fileName) || fileName.length > 255
      || typeof file !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(file)) throw Errors.InvalidExcelFormat('A base64 .xlsx file is required');
  const buffer = Buffer.from(file, 'base64');
  if (buffer.length > 10 * 1024 * 1024) throw Errors.InvalidInput('PO file must not exceed 10 MB');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    console.error('[PO Import] Invalid workbook:', error.message);
    throw Errors.InvalidExcelFormat('Unable to read workbook');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Errors.InvalidExcelFormat('No worksheet found');
  const headers = sheet.getRow(1).values;
  const missing = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  if (missing.length) throw Errors.InvalidColumns(missing);
  const items = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if (!row.hasValues) continue;
    const value = column => row.getCell(headers.indexOf(column)).value;
    const lineNum = positiveInteger(value('Line Number'), `Row ${index} line number`);
    const productCode = value('Product Code');
    if (typeof productCode !== 'string' || !productCode.trim() || productCode.length > 50) {
      throw Errors.InvalidInput(`Row ${index}: product code is required`);
    }
    const [item] = validateItems([{
      description: value('Description'), quantity: value('Quantity'), rate: value('Unit Rate'), taxRate: value('Tax Rate'),
    }]);
    if (item.description.length > 255) throw Errors.InvalidInput(`Row ${index}: description must not exceed 255 characters`);
    items.push({ ...item, lineNum, productCode });
  }
  if (!items.length) throw Errors.InvalidInput('No data rows found');
  const result = await getDatabase().execute('sales.usp_POImport_Create', {
    correlationId: req.correlationId, vendorId: vendor, poNumber: poNumber.trim(), fileName,
    importedByEmail: req.user.email, rowsJson: JSON.stringify(items),
  });
  if (!result.recordset[0]) throw Errors.DatabaseError('PO import returned no data');
  res.status(201).json({ importId: result.recordset[0].ImportId, vendorId: vendor, poNumber,
    status: 'completed', rowsImported: items.length, itemsCount: items.length, preview: items.slice(0, 5) });
});

const handleListPOImports = asyncHandler(async (req, res) => {
  if (!req.user.permissions.includes('file.upload')) throw Errors.Forbidden('list PO imports');
  const { pageNum, pageSize } = paging(req.query);
  const result = await getDatabase().execute('sales.usp_POImport_GetList', {
    correlationId: req.correlationId, vendorId: req.query.vendorId ? positiveInteger(req.query.vendorId, 'vendorId') : null,
    status: req.query.status || null, pageNum, pageSize,
  });
  res.json({ imports: result.recordset.map(row => ({
    importId: row.ImportId, vendorId: row.VendorId, poNumber: row.PONumber,
    status: row.Status.toLowerCase(), rowsImported: row.RowsImported, createdBy: row.CreatedBy, createdOn: row.CreatedOn,
  })), ...pagedResponse(result, pageNum, pageSize) });
});

export { handleUploadPO, handleListPOImports };
