/**
 * Admin Handlers
 * GET /api/admin/users - List users
 * POST /api/admin/users - Create user
 * GET /api/admin/error-log - Search error log
 */

const { asyncHandler, Errors } = require('../middleware/error-handler');
const { getDatabase } = require('../services/database');

/**
 * GET /api/admin/users
 * List all users with roles and status
 */
const handleListUsers = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { role, status, page = 1, pageSize = 50 } = req.query;

  // Check permission
  if (!req.user?.permissions?.includes('user.admin.read')) {
    throw Errors.Forbidden('list users');
  }

  // Validate paging
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSz = Math.min(100, Math.max(1, parseInt(pageSize) || 50));

  const db = getDatabase();
  const result = await db.execute('usp_User_GetList', {
    correlationId,
    role: role || null,
    status: status || null,
    pageNum,
    pageSize: pageSz,
  });

  if (!result.recordset) {
    throw Errors.DatabaseError('Failed to retrieve users');
  }

  const users = result.recordset.filter(r => r.UserId);
  const totalCount = result.recordset.find(r => r.TotalCount)?.TotalCount || 0;

  res.json({
    users: users.map(user => ({
      userId: user.UserId,
      email: user.Email,
      name: user.Name,
      roles: user.Roles ? user.Roles.split(',') : [],
      status: user.Status,
      createdOn: user.CreatedOn,
      lastLogin: user.LastLogin,
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
 * POST /api/admin/users
 * Create new user and assign roles
 */
const handleCreateUser = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { email, name, roles = [] } = req.body;

  // Check permission
  if (!req.user?.permissions?.includes('user.admin.write')) {
    throw Errors.Forbidden('create users');
  }

  // Validate input
  if (!email || !name) {
    throw Errors.InvalidInput('email and name are required');
  }

  // Validate email format
  if (!email.includes('@')) {
    throw Errors.InvalidInput('email must be valid');
  }

  if (!Array.isArray(roles)) {
    throw Errors.InvalidInput('roles must be an array');
  }

  const db = getDatabase();

  // Create user
  const createResult = await db.execute('usp_User_Create', {
    correlationId,
    email,
    name,
    createdByEmail: req.user.email,
  });

  if (!createResult.recordset || createResult.recordset.length === 0) {
    throw Errors.DatabaseError('Failed to create user');
  }

  const userId = createResult.recordset[0].UserId;

  // Assign roles
  for (const role of roles) {
    await db.execute('usp_User_AssignRole', {
      correlationId,
      userId,
      roleName: role,
    });
  }

  // Get created user
  const getResult = await db.query(
    `SELECT UserId, Email, Name, Status, CreatedOn FROM [security].[User] WHERE UserId = @userId`,
    { userId }
  );

  if (getResult.length === 0) {
    throw Errors.DatabaseError('Failed to retrieve created user');
  }

  const user = getResult[0];

  res.status(201).json({
    userId: user.UserId,
    email: user.Email,
    name: user.Name,
    roles,
    status: user.Status,
    createdOn: user.CreatedOn,
  });
});

/**
 * GET /api/admin/error-log
 * Search error log with filtering and paging
 */
const handleSearchErrorLog = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const {
    errorCode,
    userId,
    from,
    to,
    page = 1,
    pageSize = 50,
  } = req.query;

  // Check permission
  if (!req.user?.permissions?.includes('error.log.read')) {
    throw Errors.Forbidden('view error log');
  }

  // Validate paging
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSz = Math.min(100, Math.max(1, parseInt(pageSize) || 50));

  // Validate date range if provided
  let fromDate = null;
  let toDate = null;

  if (from) {
    fromDate = new Date(from);
    if (isNaN(fromDate.getTime())) {
      throw Errors.InvalidInput('from must be a valid date (ISO format)');
    }
  }

  if (to) {
    toDate = new Date(to);
    if (isNaN(toDate.getTime())) {
      throw Errors.InvalidInput('to must be a valid date (ISO format)');
    }
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw Errors.InvalidInput('from date must be before to date');
  }

  const db = getDatabase();
  const result = await db.execute('usp_ErrorLog_GetList', {
    correlationId,
    errorCode: errorCode || null,
    userId: userId || null,
    fromDate: fromDate?.toISOString() || null,
    toDate: toDate?.toISOString() || null,
    pageNum,
    pageSize: pageSz,
  });

  if (!result.recordset) {
    throw Errors.DatabaseError('Failed to retrieve error log');
  }

  const errors = result.recordset.filter(r => r.ErrorLogId);
  const totalCount = result.recordset.find(r => r.TotalCount)?.TotalCount || 0;

  res.json({
    errors: errors.map(err => ({
      errorLogId: err.ErrorLogId,
      errorCode: err.ErrorCode,
      title: err.Title,
      userMessage: err.UserMessage,
      technicalMessage: err.TechnicalMessage,
      userId: err.UserId,
      correlationId: err.CorrelationId,
      endpoint: err.Endpoint,
      timestamp: err.Timestamp,
      severity: err.Severity,
    })),
    pagination: {
      page: pageNum,
      pageSize: pageSz,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSz),
    },
    summary: {
      periodFrom: from || 'all time',
      periodTo: to || 'now',
      errorCodeFilter: errorCode || 'all codes',
      userIdFilter: userId || 'all users',
    },
  });
});

module.exports = {
  handleListUsers,
  handleCreateUser,
  handleSearchErrorLog,
};
