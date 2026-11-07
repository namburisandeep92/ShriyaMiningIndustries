#!/usr/bin/env node

/**
 * API Entry Point
 * Local development server startup
 * 
 * Usage:
 *   npm run api:dev
 *   # Server runs on http://localhost:7071
 */

import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

process.env.ENVIRONMENT ||= 'development';
process.env.NODE_ENV ||= 'development';

if (!process.env.DB_CONNECTION_STRING && process.env.ENVIRONMENT !== 'production') {
  for (const [target, source] of Object.entries({
    DB_SERVER: 'DB_TEST_HOST',
    DB_DATABASE: 'DB_TEST_NAME',
    DB_USERNAME: 'DB_TEST_USER',
    DB_PASSWORD: 'DB_TEST_PASSWORD',
  })) {
    if (!process.env[target] && process.env[source]) {
      process.env[target] = process.env[source];
    }
  }
}

const port = process.env.PORT || 7071;
startServer(port);
