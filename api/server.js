/**
 * Main API Server Setup
 * 
 * Initializes Express, middleware, routes, and error handling
 * Entry point for Azure Functions or local server
 */

const express = require('express');
const cors = require('cors');
const correlationIdMw = require('./middleware/correlation-id');
const authMw = require('./middleware/auth');
const { errorHandler, asyncHandler } = require('./middleware/error-handler');
const { getDatabase } = require('./services/database');

/**
 * Create and configure Express app
 */
const createApp = async () => {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' })); // Support large Excel uploads
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CORS - Allow SWA and local development
  app.use(cors({
    origin: [
      process.env.SWA_ORIGIN || 'http://localhost:4280', // SWA local dev
      process.env.FRONTEND_URL || 'https://swa-smi-invoice-test.azurestaticapps.net',
    ],
    credentials: true,
  }));

  // Correlation ID (must be early)
  app.use(correlationIdMw.middleware);

  // Authentication (must be before protected routes)
  app.use(authMw.middleware);

  // ========== HEALTH & INFO ==========
  app.get('/api/health', asyncHandler(async (req, res) => {
    const db = getDatabase();
    const isHealthy = await db.isHealthy();

    res.json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: isHealthy ? 'connected' : 'unavailable',
      version: '1.0.0',
      environment: process.env.ENVIRONMENT || 'unknown',
    });
  }));

  app.get('/api/me', asyncHandler(async (req, res) => {
    res.json({
      user: req.user || null,
      timestamp: new Date().toISOString(),
    });
  }));

  // ========== OpenAPI / Swagger (placeholder) ==========
  app.get('/api/openapi.yaml', asyncHandler(async (req, res) => {
    // TODO: Generate OpenAPI spec from route definitions
    res.type('text/yaml').send(`
openapi: 3.1.0
info:
  title: SMI Invoice Platform API
  version: 1.0.0-alpha
  description: |
    Backend API for Shriya Mining Industries invoice platform.
    
    **Authentication**: Requires x-ms-client-principal header (set by Azure Static Web Apps)
    **Error Handling**: All errors include correlation ID in response headers
servers:
  - url: https://swa-smi-invoice-test.azurestaticapps.net/api
    description: Test environment
  - url: https://swa-smi-invoice-prod.azurestaticapps.net/api
    description: Production environment
paths:
  /health:
    get:
      summary: Health check
      tags: [System]
      responses:
        200:
          description: System is healthy
  /me:
    get:
      summary: Current user info
      tags: [Auth]
      responses:
        200:
          description: User profile
        401:
          description: Not authenticated
`);
  }));

  app.get('/api/docs', asyncHandler(async (req, res) => {
    // TODO: Serve Swagger UI
    res.html(`
<!DOCTYPE html>
<html>
<head>
  <title>SMI Invoice API</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.yaml',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset,
      ],
    });
  </script>
</body>
</html>
    `);
  }));

  // ========== PLACEHOLDER ROUTES ==========
  // These will be implemented in Step 6b

  // PO Import
  app.post('/api/po-import', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.get('/api/po-import', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  // Invoice CRUD
  app.post('/api/invoices', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.get('/api/invoices', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.get('/api/invoices/:id', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.patch('/api/invoices/:id', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.delete('/api/invoices/:id', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  // Export & History
  app.get('/api/invoices/:id/versions', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.get('/api/invoices/:id/versions/:version', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.get('/api/invoices/:id/export', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  // Admin
  app.get('/api/admin/users', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.post('/api/admin/users', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  app.get('/api/admin/error-log', asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
  }));

  // ========== 404 Handler ==========
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'API-NOT-FOUND-404',
        message: `Endpoint not found: ${req.method} ${req.path}`,
        referenceId: req.correlationId,
      },
    });
  });

  // ========== ERROR HANDLER (must be last) ==========
  app.use(errorHandler);

  return app;
};

/**
 * Start local server (for development)
 */
const startServer = async (port = 3000) => {
  try {
    // Initialize database
    const db = getDatabase();
    await db.connect();

    // Create app
    const app = await createApp();

    // Listen
    app.listen(port, () => {
      console.log(`[API] Server running at http://localhost:${port}`);
      console.log(`[API] Health check: http://localhost:${port}/api/health`);
      console.log(`[API] Docs: http://localhost:${port}/api/docs`);
    });
  } catch (err) {
    console.error('[API] Startup failed:', err);
    process.exit(1);
  }
};

module.exports = {
  createApp,
  startServer,
};
