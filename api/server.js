/**
 * Main API Server Setup
 * 
 * Initializes Express, middleware, routes, and error handling
 * Entry point for Azure Functions or local server
 */

import express from 'express';
import cors from 'cors';
import * as correlationIdMw from './middleware/correlation-id.js';
import * as authMw from './middleware/auth.js';
import { errorHandler, asyncHandler } from './middleware/error-handler.js';
import { getDatabase } from './services/database.js';
import { fileURLToPath } from 'node:url';

// Import route handlers
import {
  handleUploadPO,
  handleListPOImports,
} from './functions/po-import.js';
import {
  handleCreateInvoice,
  handleListInvoices,
  handleGetInvoice,
  handleUpdateInvoice,
  handleDeleteInvoice,
} from './functions/invoice-crud.js';
import {
  handleExportInvoice,
} from './functions/invoice-export.js';
import {
  handleListVersions,
  handleGetVersion,
} from './functions/invoice-history.js';
import {
  handleListUsers,
  handleCreateUser,
  handleSearchErrorLog,
} from './functions/admin.js';

/**
 * Validate required environment variables at startup
 * Fail fast if config is invalid
 */
const validateEnvironment = () => {
  const requiredEnv = [
    'ENVIRONMENT',
    'NODE_ENV',
    ...(process.env.DB_CONNECTION_STRING ? [] : [
      'DB_SERVER',
      'DB_DATABASE',
      'DB_USERNAME',
      'DB_PASSWORD',
    ]),
  ];

  const missing = requiredEnv.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    const error = `Missing required environment variables: ${missing.join(', ')}`;
    console.error(`[STARTUP ERROR] ${error}`);
    throw new Error(error);
  }

  // Validate environment is valid
  if (!['test', 'production', 'development'].includes(process.env.ENVIRONMENT)) {
    throw new Error(`Invalid ENVIRONMENT: ${process.env.ENVIRONMENT}. Must be: test, production, development`);
  }

  // Log validated config (NOT secrets)
  console.log(`[STARTUP] Environment: ${process.env.ENVIRONMENT}`);
  console.log(`[STARTUP] Node Env: ${process.env.NODE_ENV}`);
  console.log(`[STARTUP] Log Level: ${process.env.LOG_LEVEL || 'info'}`);
};

/**
 * Determine CORS origin based on environment
 * Production: uses prod SWA URL
 * Test/Dev: allows localhost and test SWA
 */
const getCorsOrigins = () => {
  const isProd = process.env.ENVIRONMENT === 'production';
  
  if (isProd) {
    // Production: only allow prod SWA URL
    // This prevents test/dev URLs from accessing prod API
    return [
      process.env.FRONTEND_URL || 'https://swa-smi-invoice-prod.azurestaticapps.net',
    ];
  }

  // Test/Dev: allow localhost and test SWA
  return [
    'http://localhost:3000',
    'http://localhost:4280',
    'http://localhost:5173',
    process.env.SWA_ORIGIN || 'http://localhost:4280',
    'https://swa-smi-invoice-test.azurestaticapps.net',
  ];
};

/**
 * Create and configure Express app
 */
const createApp = async () => {
  // Validate environment BEFORE anything else
  validateEnvironment();

  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' })); // Support large Excel uploads
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CORS - Configured per environment
  const corsOrigins = getCorsOrigins();
  console.log(`[STARTUP] CORS allowed origins: ${corsOrigins.join(', ')}`);
  
  app.use(cors({
    origin: corsOrigins,
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
    if (!req.user) {
      return res.json({
        authenticated: false,
        user: null,
      });
    }

    res.json({
      authenticated: true,
      user: {
        email: req.user.email,
        name: req.user.name,
        roles: req.user.roles,
        permissions: req.user.permissions,
      },
    });
  }));

  // ========== OpenAPI / Swagger (placeholder) ==========
  app.get('/api/openapi.yaml', asyncHandler(async (req, res) => {
    res.type('text/yaml').sendFile(fileURLToPath(new URL('./openapi.yaml', import.meta.url)));
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

  // ========== PO IMPORT ==========
  app.post('/api/po-import', authMw.requireAuth, handleUploadPO);
  app.get('/api/po-import', authMw.requireAuth, handleListPOImports);

  // ========== INVOICE CRUD ==========
  app.post('/api/invoices', authMw.requireAuth, handleCreateInvoice);
  app.get('/api/invoices', authMw.requireAuth, handleListInvoices);
  app.get('/api/invoices/:id', authMw.requireAuth, handleGetInvoice);
  app.patch('/api/invoices/:id', authMw.requireAuth, handleUpdateInvoice);
  app.delete('/api/invoices/:id', authMw.requireAuth, handleDeleteInvoice);

  // ========== EXPORT & HISTORY ==========
  app.get('/api/invoices/:id/versions', authMw.requireAuth, handleListVersions);
  app.get('/api/invoices/:id/versions/:version', authMw.requireAuth, handleGetVersion);
  app.get('/api/invoices/:id/export', authMw.requireAuth, handleExportInvoice);

  // ========== ADMIN ==========
  app.get('/api/admin/users', authMw.requireAuth, authMw.requireRole('Admin'), handleListUsers);
  app.post('/api/admin/users', authMw.requireAuth, authMw.requireRole('Admin'), handleCreateUser);
  app.get('/api/admin/error-log', authMw.requireAuth, authMw.requireRole('Admin'), handleSearchErrorLog);

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
const startServer = async (port = 7071) => {
  try {
    validateEnvironment();

    // Initialize database
    const db = getDatabase();
    console.log('[STARTUP] Connecting to database...');
    
    await db.connect();
    console.log('[STARTUP] Database connection verified ✓');

    // Quick health check
    const isHealthy = await db.isHealthy();
    if (!isHealthy) {
      throw new Error('Database is not healthy. Check connection string and network.');
    }
    console.log('[STARTUP] Database health check passed ✓');

    // Create app
    const app = await createApp();

    // Listen
    app.listen(port, () => {
      console.log(`[STARTUP] ✓ API Server running at http://localhost:${port}`);
      console.log(`[API] Health check: http://localhost:${port}/api/health`);
      console.log(`[API] Docs: http://localhost:${port}/api/docs`);
    });
  } catch (err) {
    console.error('[STARTUP FAILED] ✗', err.message);
    process.exit(1);
  }
};

/**
 * Create app for Azure Functions (no DB connection at startup)
 * Database connects on first request
 */
const createAppForFunctions = async () => {
  // Validate environment FIRST
  validateEnvironment();
  return createApp();
};

export {
  createApp,
  createAppForFunctions,
  startServer,
  validateEnvironment,
};
