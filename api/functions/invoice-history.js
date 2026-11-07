import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import { invoiceId, invoiceResponse, positiveInteger } from '../services/api-contracts.js';

const handleListVersions = asyncHandler(async (req, res) => {
  if (!req.user.permissions.includes('invoice.read')) throw Errors.Forbidden('view invoice history');
  const id = invoiceId(req.params.id);
  const result = await getDatabase().execute('app.usp_Invoice_GetHistory', { correlationId: req.correlationId, invoiceId: id });
  res.json({ invoiceId: id, versions: result.recordset.map(row => ({
    version: row.Version, status: row.Status.toLowerCase(), totalAmount: row.TotalAmount,
    modifiedOn: row.ModifiedOn, modifiedAt: row.ModifiedOn, modifiedBy: row.ModifiedBy,
    changeDescription: row.ChangeDescription,
  })) });
});

async function getVersion(id, version, correlationId) {
  const result = await getDatabase().execute('app.usp_Invoice_GetVersion', {
    correlationId, invoiceId: invoiceId(id), version: positiveInteger(version, 'version'),
  });
  if (!result.recordset[0]) throw Errors.NotFound('Invoice version');
  return invoiceResponse(result.recordset[0], result.recordsets[1]);
}

const handleGetVersion = asyncHandler(async (req, res) => {
  if (!req.user.permissions.includes('invoice.read')) throw Errors.Forbidden('view invoice version');
  res.json(await getVersion(req.params.id, req.params.version, req.correlationId));
});

const handleCompareVersions = asyncHandler(async (req, res) => {
  if (!req.user.permissions.includes('invoice.read')) throw Errors.Forbidden('compare invoice versions');
  const [before, after] = await Promise.all([
    getVersion(req.params.id, req.query.v1, req.correlationId),
    getVersion(req.params.id, req.query.v2, req.correlationId),
  ]);
  const changes = ['status', 'notes', 'totalAmount', 'lineItems', 'document'].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(field => ({ field, before: before[field], after: after[field] }));
  res.json({ before, after, changes });
});

export { handleListVersions, handleGetVersion, handleCompareVersions };
