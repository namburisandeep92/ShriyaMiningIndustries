#!/usr/bin/env node

/**
 * Post-Deployment Smoke Test
 * Verifies basic functionality after deployment
 * 
 * Usage:
 *   VITE_API_BASE_URL=https://swa-smi-invoice-prod.azurestaticapps.net node scripts/smoke-test.js
 */

const http = require('http');
const https = require('https');

const baseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:3000';
const timeout = 30000; // 30 seconds

console.log(`🧪 Starting smoke tests for: ${baseUrl}`);
console.log(`   Timeout: ${timeout}ms\n`);

let passCount = 0;
let failCount = 0;

/**
 * Make HTTP request
 */
const request = (url, method = 'GET', headers = {}) => {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;

    const options = new URL(url);
    options.method = method;
    options.timeout = timeout;
    options.headers = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.end();
  });
};

/**
 * Test: API Health Check
 */
const testHealthCheck = async () => {
  try {
    const res = await request(`${baseUrl}/api/health`);
    
    if (res.status !== 200) {
      console.log(`❌ Health check failed: HTTP ${res.status}`);
      failCount++;
      return;
    }

    const body = JSON.parse(res.body);
    if (body.status !== 'healthy' && body.status !== 'degraded') {
      console.log(`❌ Health check: invalid status '${body.status}'`);
      failCount++;
      return;
    }

    console.log(`✅ Health check: ${body.status}`);
    passCount++;
  } catch (err) {
    console.log(`❌ Health check failed: ${err.message}`);
    failCount++;
  }
};

/**
 * Test: Current User Endpoint
 */
const testMeEndpoint = async () => {
  try {
    const res = await request(`${baseUrl}/api/me`);
    
    if (res.status !== 200) {
      console.log(`❌ /api/me failed: HTTP ${res.status}`);
      failCount++;
      return;
    }

    const body = JSON.parse(res.body);
    if (!body.hasOwnProperty('authenticated')) {
      console.log(`❌ /api/me: missing 'authenticated' field`);
      failCount++;
      return;
    }

    console.log(`✅ /api/me: ${body.authenticated ? 'authenticated' : 'not authenticated'}`);
    passCount++;
  } catch (err) {
    console.log(`❌ /api/me failed: ${err.message}`);
    failCount++;
  }
};

/**
 * Test: Frontend HTML loads
 */
const testFrontendLoads = async () => {
  try {
    const res = await request(`${baseUrl}/`);
    
    if (res.status !== 200) {
      console.log(`❌ Frontend load failed: HTTP ${res.status}`);
      failCount++;
      return;
    }

    if (!res.body.includes('<!DOCTYPE html') && !res.body.includes('</html>')) {
      console.log(`❌ Frontend: invalid HTML`);
      failCount++;
      return;
    }

    console.log(`✅ Frontend: HTML loads (${res.body.length} bytes)`);
    passCount++;
  } catch (err) {
    console.log(`❌ Frontend load failed: ${err.message}`);
    failCount++;
  }
};

/**
 * Test: Swagger documentation loads
 */
const testSwaggerLoads = async () => {
  try {
    const res = await request(`${baseUrl}/api/docs`);
    
    if (res.status !== 200) {
      console.log(`⚠️  Swagger docs: HTTP ${res.status} (optional)`);
      return;
    }

    if (!res.body.includes('swagger-ui')) {
      console.log(`⚠️  Swagger docs: not found (optional)`);
      return;
    }

    console.log(`✅ Swagger docs: loads`);
    passCount++;
  } catch (err) {
    console.log(`⚠️  Swagger docs: ${err.message} (optional)`);
  }
};

/**
 * Test: OpenAPI YAML exists
 */
const testOpenApiExists = async () => {
  try {
    const res = await request(`${baseUrl}/api/openapi.yaml`);
    
    if (res.status !== 200) {
      console.log(`⚠️  OpenAPI: HTTP ${res.status} (optional)`);
      return;
    }

    if (!res.body.includes('openapi') && !res.body.includes('swagger')) {
      console.log(`⚠️  OpenAPI: invalid format (optional)`);
      return;
    }

    console.log(`✅ OpenAPI spec: exists`);
    passCount++;
  } catch (err) {
    console.log(`⚠️  OpenAPI spec: ${err.message} (optional)`);
  }
};

/**
 * Run all tests
 */
const runTests = async () => {
  console.log('Running critical tests...\n');
  
  await testHealthCheck();
  await testMeEndpoint();
  await testFrontendLoads();
  
  console.log('\nRunning optional tests...\n');
  
  await testSwaggerLoads();
  await testOpenApiExists();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log(`${'='.repeat(50)}\n`);

  if (failCount > 0) {
    console.log('❌ Some critical tests failed!');
    process.exit(1);
  }

  console.log('✅ All critical tests passed!');
  process.exit(0);
};

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
