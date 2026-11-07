import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import { paging, pagedResponse } from '../services/api-contracts.js';

function requirePermission(req, permission) {
  if (!req.user.permissions.includes(permission)) throw Errors.Forbidden(permission);
}

function userResponse(user) {
  const roles = user.Roles ? user.Roles.split(',') : [];
  return { id: user.UserId, userId: user.UserId, email: user.Email, name: user.Name,
    roles, role: roles.join(', '), status: user.IsActive ? 'active' : 'inactive',
    createdOn: user.CreatedOn, createdAt: user.CreatedOn, lastLogin: user.LastLogin };
}

const handleListUsers = asyncHandler(async (req, res) => {
  requirePermission(req, 'user.manage');
  const { pageNum, pageSize } = paging(req.query);
  const result = await getDatabase().execute('security.usp_User_GetList', {
    correlationId: req.correlationId, role: req.query.role || null, status: req.query.status || null, pageNum, pageSize,
  });
  res.json({ users: result.recordset.map(userResponse), ...pagedResponse(result, pageNum, pageSize) });
});

const handleCreateUser = asyncHandler(async (req, res) => {
  requirePermission(req, 'user.manage');
  const { email } = req.body;
  const name = req.body.name || email;
  const roles = req.body.roles ?? (req.body.role ? [req.body.role] : []);
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255
      || typeof name !== 'string' || name.length > 255 || !Array.isArray(roles)
      || roles.some(role => typeof role !== 'string')) throw Errors.InvalidInput('Valid email, name and roles are required');
  const result = await getDatabase().execute('security.usp_User_Create', {
    correlationId: req.correlationId, email, name, rolesJson: JSON.stringify(roles), createdByEmail: req.user.email,
  });
  if (!result.recordset[0]) throw Errors.DatabaseError('User creation returned no data');
  res.status(201).json(userResponse(result.recordset[0]));
});

const handleDeleteUser = asyncHandler(async (req, res) => {
  requirePermission(req, 'user.manage');
  if (!req.params.id || req.params.id.length > 255) throw Errors.InvalidInput('Invalid userId');
  await getDatabase().execute('security.usp_User_Delete', {
    userId: req.params.id, modifiedByEmail: req.user.email, correlationId: req.correlationId,
  });
  res.status(204).end();
});

const handleSearchErrorLog = asyncHandler(async (req, res) => {
  requirePermission(req, 'errorlog.view');
  const { pageNum, pageSize } = paging(req.query);
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))
      || (fromDate && toDate && fromDate > toDate)) throw Errors.InvalidInput('Invalid date range');
  const result = await getDatabase().execute('log.usp_ErrorLog_GetList', {
    correlationId: req.correlationId, errorCode: req.query.errorCode || null, userId: req.query.userId || null,
    fromDate, toDate, pageNum, pageSize, search: req.query.search || null, severity: req.query.severity || null,
  });
  res.json({ errors: result.recordset.map(row => ({
    id: row.ErrorLogId, errorLogId: row.ErrorLogId, errorCode: row.ErrorCode, title: row.Title,
    message: row.UserMessage || row.TechnicalMessage, userMessage: row.UserMessage,
    technicalMessage: row.TechnicalMessage, stack: row.StackTrace,
    userId: row.UserId, correlationId: row.CorrelationId, endpoint: row.Endpoint,
    timestamp: row.Timestamp, severity: row.Severity?.toLowerCase(),
    context: { correlationId: row.CorrelationId, layer: row.Layer },
  })), ...pagedResponse(result, pageNum, pageSize) });
});

export { handleListUsers, handleCreateUser, handleDeleteUser, handleSearchErrorLog };
