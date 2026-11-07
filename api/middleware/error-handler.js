/**
 * Global Error Handler Middleware
 * Captures all errors, logs them with correlation ID, and returns structured responses
 * 
 * Features:
 * - Unique correlation ID per request (for distributed tracing)
 * - Error code mapping (INV-SAVE-409, etc.)
 * - Logs to database + Application Insights
 * - User-friendly error messages
 * - Technical details in logs only
 */

import * as correlationId from './correlation-id.js';

/**
 * Error response structure
 */
class ApiError extends Error {
  constructor(statusCode, errorCode, userMessage, technicalDetails = null) {
    super(userMessage);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.userMessage = userMessage;
    this.technicalDetails = technicalDetails;
  }
}

/**
 * Global error handler middleware
 * Use: app.use(errorHandler)
 */
const errorHandler = async (err, req, res, next) => {
  const corrId = req.correlationId || correlationId.generate();
  const sqlErrors = {
    50400: Errors.InvalidInput(err.message),
    50404: Errors.NotFound('Resource'),
    50409: Errors.Conflict(err.message),
    2601: Errors.Conflict('A record with these values already exists'),
    2627: Errors.Conflict('A record with these values already exists'),
  };
  if (sqlErrors[err.number]) err = sqlErrors[err.number];
  
  // Determine error details
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'API-ERROR-500';
  let userMessage = err.userMessage || 'An unexpected error occurred. Please contact support.';
  let technicalDetails = err.technicalDetails || err.message;

  // Log to database (if available)
  try {
    // In production, this would insert into [log].[ErrorLog]
    // For now, we log to console + Application Insights
    console.error({
      correlationId: corrId,
      errorCode,
      statusCode,
      userMessage,
      technicalDetails,
      stack: err.stack,
      timestamp: new Date().toISOString(),
      userId: req.user?.email || 'anonymous',
      endpoint: `${req.method} ${req.path}`,
    });
  } catch (logErr) {
    console.error('Failed to log error:', logErr);
  }

  // Return error response
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: userMessage,
      referenceId: corrId, // User can provide this to support
      timestamp: new Date().toISOString(),
    },
    // Include technical details only in development
    ...(process.env.NODE_ENV === 'development' && {
      debug: {
        technicalMessage: technicalDetails,
        stack: err.stack,
      },
    }),
  });
};

/**
 * Async route wrapper - catches errors in async functions
 * Use: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Common error constructors
 */
const Errors = {
  // 400 Bad Request
  InvalidInput: (details) =>
    new ApiError(400, 'API-INPUT-400', 'Invalid input provided', details),

  InvalidColumns: (columns) =>
    new ApiError(400, 'IMPORT-COLUMNS-400', `Missing required columns: ${columns.join(', ')}`, null),

  InvalidExcelFormat: (detail) =>
    new ApiError(400, 'IMPORT-FORMAT-400', 'Invalid Excel file format', detail),

  // 401 Unauthorized
  Unauthorized: () =>
    new ApiError(401, 'AUTH-LOGIN-401', 'Authentication required', null),

  InvalidToken: () =>
    new ApiError(401, 'AUTH-TOKEN-401', 'Invalid or expired token', null),

  // 403 Forbidden
  Forbidden: (action = 'perform this action') =>
    new ApiError(403, 'AUTH-PERM-403', `You do not have permission to ${action}`, null),

  // 404 Not Found
  NotFound: (resource = 'Resource') =>
    new ApiError(404, 'API-NOT-FOUND-404', `${resource} not found`, null),

  // 409 Conflict
  Conflict: (detail = 'This invoice has been modified by another user') =>
    new ApiError(409, 'INV-CONFLICT-409', detail, null),

  DuplicateInvoice: () =>
    new ApiError(409, 'INV-DUPLICATE-409', 'An invoice with this number already exists', null),

  // 500 Internal Server Error
  DatabaseError: (detail) =>
    new ApiError(500, 'DB-ERROR-500', 'Database error occurred', detail),

  DatabaseTimeout: () =>
    new ApiError(503, 'DB-TIMEOUT-503', 'Database is temporarily unavailable. Please try again.', null),

  InternalError: (detail) =>
    new ApiError(500, 'API-ERROR-500', 'An unexpected error occurred', detail),
};

export {
  ApiError,
  errorHandler,
  asyncHandler,
  Errors,
};
