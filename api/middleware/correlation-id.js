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
import { Errors } from './error-handler.js';

/**
 * Generate a correlation ID
 */
const generate = () => uuidv4();

/**
 * Middleware to attach correlation ID to request
 * Use: app.use(correlationIdMiddleware)
 */
const middleware = (req, res, next) => {
  const supplied = req.headers['x-correlation-id'];
  if (supplied !== undefined && (typeof supplied !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplied))) {
    return next(Errors.InvalidInput('X-Correlation-Id must be a UUID'));
  }
  req.correlationId = supplied || generate();
  
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
