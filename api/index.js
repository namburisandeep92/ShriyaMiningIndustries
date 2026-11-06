#!/usr/bin/env node

/**
 * API Entry Point
 * Local development server startup
 * 
 * Usage:
 *   npm run api:dev
 *   # Server runs on http://localhost:3000
 */

require('dotenv').config({ path: '.env' });

const { startServer } = require('./server');

const port = process.env.PORT || 3000;
startServer(port);
