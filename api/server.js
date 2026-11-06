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

// Import route handlers
const {
  handleUploadPO,
  handleListPOImports,
} = require('./functions/po-import');
const {
  handleCreateInvoice,
  handleListInvoices,
  handleGetInvoice,
  handleUpdateInvoice,
  handleDeleteInvoice,
} = require('./functions/invoice-crud');
const {
  handleExportInvoice,
} = require('./functions/invoice-export');
const {
  handleListVersions,
  handleGetVersion,
} = require('./functions/invoice-history');
const {
  handleListUsers,
  handleCreateUser,
  handleSearchErrorLog,
} = require('./functions/admin');

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
    res.type('text/yaml').sendFile('./api/openapi.yaml');
  }));

  app.get('/api/docs', asyncHandler(async (req, res) => {
    // Swagger UI HTML - served from CDN
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="SMI Invoice Platform - API Documentation" />
  <title>SMI Invoice API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      padding: 0;
    }
    .topbar {
      background-color: #2c3e50;
      border-bottom: 1px solid #0b1217;
    }
    .info .title {
      color: #2c3e50;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
  <script>
    const ui = SwaggerUIBundle({
      url: '/api/openapi.yaml',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset,
      ],
      layout: 'StandaloneLayout',
      deepLinking: true,
      preloadContent: false,
      onFailure: function(error) {
        console.error('Failed to load Swagger UI:', error);
      },
    });
    window.ui = ui;
  </script>
</body>
</html>
    `;
    res.header('Content-Type', 'text/html');
    res.send(html);
  }));
  }));

  // ========== PO IMPORT ==========
  app.post('/api/po-import', handleUploadPO);
  app.get('/api/po-import', handleListPOImports);

  // ========== INVOICE CRUD ==========
  app.post('/api/invoices', handleCreateInvoice);
  app.get('/api/invoices', handleListInvoices);
  app.get('/api/invoices/:id', handleGetInvoice);
  app.patch('/api/invoices/:id', handleUpdateInvoice);
  app.delete('/api/invoices/:id', handleDeleteInvoice);

  // ========== EXPORT & HISTORY ==========
  app.get('/api/invoices/:id/versions', handleListVersions);
  app.get('/api/invoices/:id/versions/:version', handleGetVersion);
  app.get('/api/invoices/:id/export', handleExportInvoice);

  // ========== ADMIN ==========
  app.get('/api/admin/users', handleListUsers);
  app.post('/api/admin/users', handleCreateUser);
  app.get('/api/admin/error-log', handleSearchErrorLog);

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
