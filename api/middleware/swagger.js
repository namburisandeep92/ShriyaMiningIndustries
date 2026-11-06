/**
 * /api/middleware/swagger.js
 * 
 * Swagger UI middleware for API documentation
 * - Enabled in local development and test environments
 * - Disabled in production (unless explicitly enabled)
 * - Serves OpenAPI spec at /api/openapi.yaml
 */

import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.join(__dirname, '..', 'openapi.yaml');

// Check if Swagger is enabled for this environment
function isSwaggerEnabled() {
  const env = process.env.NODE_ENV || 'development';
  const enableSwagger = process.env.ENABLE_SWAGGER || 'true';
  
  // Never enable in production unless explicitly set
  if (env === 'production' && enableSwagger !== 'true') {
    return false;
  }
  
  // Enable in development and test
  return env === 'development' || env === 'test';
}

// Load and parse OpenAPI spec
function loadSwaggerSpec() {
  try {
    const spec = fs.readFileSync(specPath, 'utf8');
    // Parse YAML manually (simple approach for flat structure)
    return parseYaml(spec);
  } catch (error) {
    console.error('Failed to load OpenAPI spec:', error.message);
    return null;
  }
}

// Simple YAML parser for our spec
function parseYaml(yamlContent) {
  // For production use, consider using js-yaml package
  // For now, we'll use a very basic approach suitable for our OpenAPI spec
  const lines = yamlContent.split('\n');
  const result = {};
  let currentKey = '';
  let currentIndent = 0;
  let stack = [result];

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();
    const [key, ...valueParts] = trimmed.split(':');
    const value = valueParts.join(':').trim();

    // Very basic YAML parsing - not production-ready but sufficient for loading spec
    if (key && value) {
      const parent = stack[stack.length - 1];
      if (typeof parent === 'object') {
        parent[key] = value.replace(/['"]([^'"]*)['"]/g, '$1') || {};
      }
    }
  }

  return result;
}

// Custom CSS for Swagger UI
const swaggerCustomCss = `
  .topbar {
    background-color: #2c3e50;
  }
  .info .title {
    color: #2c3e50;
  }
  .scheme-container {
    background-color: #f8f9fa;
    border-radius: 4px;
  }
`;

/**
 * Middleware to serve Swagger UI
 * Usage: app.use('/api/docs', setupSwagger());
 */
export function setupSwagger() {
  if (!isSwaggerEnabled()) {
    return (req, res, next) => {
      res.status(404).json({
        error: {
          code: 'API-DOCS-404',
          message: 'API documentation is not available in this environment'
        }
      });
    };
  }

  const spec = loadSwaggerSpec();
  if (!spec) {
    console.warn('OpenAPI spec not found; Swagger UI disabled');
    return (req, res, next) => {
      res.status(500).json({
        error: {
          code: 'API-DOCS-500',
          message: 'Failed to load API documentation'
        }
      });
    };
  }

  // Configure Swagger UI options
  const options = {
    customCss: swaggerCustomCss,
    customSiteTitle: 'SMI Invoice Platform - API Documentation',
    swaggerOptions: {
      urls: [
        {
          url: '/api/openapi.yaml',
          name: 'OpenAPI (Current)'
        }
      ],
      deepLinking: true,
      presets: [
        swaggerUi.presets.apis,
        swaggerUi.SwaggerUIBundle.presets.configuration
      ],
      plugins: [
        swaggerUi.SwaggerUIBundle.plugins.DownloadUrl
      ],
      layout: 'BaseLayout',
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      displayOperationId: true
    }
  };

  return swaggerUi.serve;
}

/**
 * Setup route for Swagger UI
 * Usage: app.get('/api/docs', setupSwaggerUI());
 */
export function setupSwaggerUI() {
  if (!isSwaggerEnabled()) {
    return (req, res) => {
      res.status(404).json({
        error: {
          code: 'API-DOCS-404',
          message: 'API documentation is not available in this environment'
        }
      });
    };
  }

  const spec = loadSwaggerSpec();
  if (!spec) {
    return (req, res) => {
      res.status(500).json({
        error: {
          code: 'API-DOCS-500',
          message: 'Failed to load API documentation'
        }
      });
    };
  }

  const options = {
    customCss: swaggerCustomCss,
    customSiteTitle: 'SMI Invoice Platform - API Documentation',
    swaggerOptions: {
      url: '/api/openapi.yaml',
      deepLinking: true,
      docExpansion: 'list',
      displayOperationId: true,
      tryItOutEnabled: true
    }
  };

  return swaggerUi.setup(spec, options);
}

/**
 * Serve OpenAPI spec as JSON or YAML
 */
export function serveOpenApiSpec(req, res) {
  try {
    // Check if client wants JSON
    if (req.query.format === 'json') {
      res.header('Content-Type', 'application/json');
      res.send(JSON.stringify(loadSwaggerSpec(), null, 2));
    } else {
      // Default: YAML
      res.header('Content-Type', 'application/yaml');
      res.sendFile(specPath);
    }
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'API-SPEC-500',
        message: 'Failed to serve API specification',
        referenceId: req.correlationId || 'unknown'
      }
    });
  }
}
