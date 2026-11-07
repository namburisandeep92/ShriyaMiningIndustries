import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import { paging, pagedResponse, positiveInteger } from '../services/api-contracts.js';
import { parsePendingOrders } from '../services/pending-orders.js';

const handleParsePendingOrders = asyncHandler(async (req, res) => {
  if (!req.user.permissions.includes('file.upload')) throw Errors.Forbidden('upload PO');
  const { file, fileName } = req.body;
  if (typeof fileName !== 'string' || fileName.length > 255 || typeof file !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(file)) throw Errors.InvalidExcelFormat('A named base64 PO file is required');
  res.json(await parsePendingOrders(Buffer.from(file, 'base64'), fileName));
});

const handleUploadPO = handleParsePendingOrders;

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

export { handleUploadPO, handleListPOImports, handleParsePendingOrders };
