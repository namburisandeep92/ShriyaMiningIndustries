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

import { v4 as uuidv4 } from 'uuid';

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

export {
  generate,
  middleware,
};
