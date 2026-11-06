/**
 * Correlation ID Middleware
 * Generates a unique ID per request for distributed tracing
 * 
 * Flows through:
 * - API logs
 * - Database logs
 * - Application Insights
 * - Returned to user as reference for support
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a correlation ID
 */
const generate = () => uuidv4();

/**
 * Middleware to attach correlation ID to request
 * Use: app.use(correlationIdMiddleware)
 */
const middleware = (req, res, next) => {
  // Use existing correlation ID from header, or generate new one
  req.correlationId = req.headers['x-correlation-id'] || generate();
  
  // Add to response header so client can reference it
  res.setHeader('X-Correlation-Id', req.correlationId);
  
  // Make available in response locals
  res.locals.correlationId = req.correlationId;
  
  next();
};

module.exports = {
  generate,
  middleware,
};
