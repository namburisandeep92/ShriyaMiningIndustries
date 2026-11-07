# PRODUCTION-CRITICAL GAPS (Regression & Docs Excluded)

**Date**: Nov 6, 2026  
**Focus**: What will BREAK in production deployment if not fixed  
**Status**: Blockers preventing safe prod deployment

---

## 🔴 CRITICAL BLOCKERS (Must Fix Before Going Live)

### 1. **Authentication & Authorization NOT WORKING** 🚨

**Problem**: 
- `auth.middleware` exists but `/api/me` endpoint not fully implemented
- SWA sends `x-ms-client-principal` header with user info
- staticwebapp.config.json has `rolesSource: /api/me` but no role support
- No permission checks on endpoints (anyone can create/delete invoices)

**Current State**:
```javascript
app.get('/api/me', asyncHandler(async (req, res) => {
  res.json({
    // What's returned here? Roles? Permissions?
  });
}));
```

**What's Missing**:
- ✓ Parse `x-ms-client-principal` header from SWA
- ✓ Map to database user roles
- ✓ Return roles in `/api/me` response
- ✓ Add role checks on protected endpoints
- ✓ Swagger/OpenAPI updated with auth requirements

**Impact if Missing**: Anyone can access any invoice (huge security breach in production)

---

### 2. **Database Connection String NOT VERIFIED** 🚨

**Problem**:
- App settings in Azure show `CONNECTION_STRING` but code may not be using it correctly
- Free tier database auto-pauses after 1 hour
- No health check on startup
- Connection pooling may timeout in 45-second SWA function limit

**Current State**:
```javascript
async connect(maxRetries = 3) {
  // Retries up to 3 times
  // But: No verification it connects BEFORE SWA app starts
}
```

**What's Missing**:
- ✓ Test actual connection string in Azure from prod database
- ✓ Verify `shriyamining-db` (prod) selected, NOT `shriyamining-db-test`
- ✓ Add startup health check (connect on app boot)
- ✓ Pre-warm connection on first request after cold start
- ✓ Error message if connection fails (fail fast, not silent)

**Impact if Missing**: App boots but crashes on first DB query (404 errors, users can't access anything)

---

### 3. **Deployment Workflow Issues** ⚠️

**Problem**:
- Workflows don't wait for migrations to complete before deploy
- No verification that migrations succeeded
- No rollback if migrations fail
- Deploy happens even if DB is unreachable

**Current State** (from workflows):
```yaml
- Run npm run migrate
- Deploy SWA (might happen before migrate finishes)
```

**What's Missing**:
- ✓ Add exit code check after `npm run migrate`
- ✓ Fail workflow if migration fails
- ✓ Wait for migrations before deploy step
- ✓ Log migration results to artifact
- ✓ Rollback previous migration on failure

**Impact if Missing**: Prod DB schema mismatch with code (500 errors on API calls)

---

### 4. **SWA Configuration Incomplete** 🚨

**Current staticwebapp.config.json**:
```json
{
  "auth": {
    "rolesSource": "/api/me"  // ← Good
  },
  "responseOverrides": {
    "401": {
      "rewrite": "/index.html",   // ← Should redirect to /login, not serve index
      "statusCode": 200
    }
  }
}
```

**What's Missing**:
- ✓ `401` should redirect to `/login` (not rewrite to index.html)
- ✓ `403` (not-authorized) handling
- ✓ Microsoft auth provider configuration in Azure
- ✓ Block GitHub/Google providers (security)
- ✓ Add authentication requirement to all routes except `/api/health`

**Impact if Missing**: Unauthenticated users see blank app (routing loop)

---

### 5. **Environment Variables NOT VALIDATED** ⚠️

**Problem**:
- App expects `CONNECTION_STRING`, `ENVIRONMENT`, `LOG_LEVEL`, `NODE_ENV`
- No startup check if they're set
- Silent failures if prod database connection string is wrong

**What's Missing**:
- ✓ Startup validation: throw error if required vars missing
- ✓ Verify DATABASE name is correct (prod vs test)
- ✓ Check NODE_ENV=production (affects error handling)
- ✓ Verify API_BASE_URL in frontend .env
- ✓ Log validated config on startup (not secrets, just keys)

**Code to add** (in server.js before app starts):
```javascript
const requiredEnv = ['DB_CONNECTION_STRING', 'ENVIRONMENT', 'NODE_ENV'];
requiredEnv.forEach(key => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
});
console.log(`[STARTUP] Environment: ${process.env.ENVIRONMENT}`);
console.log(`[STARTUP] Database: ${process.env.DB_DATABASE}`);
```

**Impact if Missing**: App starts but crashes silently when calling API

---

### 6. **API Error Handling NOT PRODUCTION-READY** ⚠️

**Problem**:
- Error messages might expose internal details (SQL errors, stack traces)
- No rate limiting on endpoints
- No input validation (could DOS endpoint)
- Large Excel uploads (50MB limit) not tested

**What's Missing**:
- ✓ Sanitize error messages (don't expose DB schema, SQL errors)
- ✓ Add rate limiting middleware (10 req/min per IP for sensitive endpoints)
- ✓ Validate file uploads (Excel only, max size)
- ✓ Add request timeout (30-second SWA limit)
- ✓ Log all errors to Application Insights

**Current in server.js**:
```javascript
app.use(express.json({ limit: '50mb' })); // ← No validation
```

**Impact if Missing**: 
- Attackers can DOS the API
- Users upload malicious files
- Stack traces expose database schema

---

### 7. **Database Backup NOT AUTOMATED** 🚨

**Problem**:
- No backup before production deployment
- No rollback procedure if things break
- Free tier: can you even backup?

**What's Missing**:
- ✓ Azure SQL automated backup schedule
- ✓ Pre-deploy backup step in workflow
- ✓ Backup location & retention policy
- ✓ Manual rollback procedure documented
- ✓ Test restore from backup

**Impact if Missing**: If deployment breaks prod DB, data is lost

---

### 8. **No Post-Deploy Verification** ⚠️

**Problem**:
- Deployment completes but nobody checks if it works
- Broken API = users see blank page (SPA loads, API fails)

**What's Missing**:
- ✓ Smoke test after deploy:
  - GET /api/health (check status)
  - GET /api/invoices (check auth, DB connection)
  - POST /api/invoices (create test invoice, then delete)
- ✓ Verify response times < 2 seconds
- ✓ Verify no 500 errors
- ✓ Fail deployment if smoke test fails

**Impact if Missing**: Production broken for hours before anyone notices

---

### 9. **Logging & Monitoring NOT CONFIGURED** ⚠️

**Problem**:
- Application Insights resource exists but not wired up
- No centralized error logging
- Can't debug production issues

**What's Missing**:
- ✓ Add Application Insights client to API
- ✓ Log all requests (method, path, status, duration)
- ✓ Log all errors with stack traces
- ✓ Log database connection attempts
- ✓ Alert on 500 errors (email to you)
- ✓ Dashboard showing error rate, response time, database health

**Impact if Missing**: Users report bugs, you have no way to diagnose

---

### 10. **CORS & Security Headers Incomplete** ⚠️

**Problem**:
- CORS allows `process.env.FRONTEND_URL` which might be wrong in prod
- SWA hostname isn't predictable
- Missing Content-Security-Policy header

**Current**:
```javascript
app.use(cors({
  origin: [
    'http://localhost:4280',
    'https://swa-smi-invoice-test.azurestaticapps.net', // ← Points to TEST!
  ],
}));
```

**What's Missing**:
- ✓ Update CORS origin to prod SWA URL
- ✓ Verify SWA URL is correct in Azure
- ✓ Add Content-Security-Policy header
- ✓ Add X-Content-Type-Options: nosniff
- ✓ Remove localhost from production config

**Impact if Missing**: XSS attacks can steal user tokens

---

## ✅ WHAT'S ALREADY OK

- ✓ Database retry logic (handles free tier auto-pause)
- ✓ Connection pooling
- ✓ Parameterized queries (SQL injection safe)
- ✓ Error handler middleware
- ✓ Correlation ID tracking
- ✓ Vue 3 frontend builds
- ✓ SWA deployment workflows exist

---

## 🎯 PRIORITY FIXES (Must Do Before Going Live)

### **TIER 1 - DO FIRST (Next 30 min)**
1. ✓ Verify DATABASE name in prod Azure (prod vs test)
2. ✓ Verify CONNECTION_STRING points to `shriyamining-db` (prod), not test
3. ✓ Fix CORS origin from test SWA to prod SWA URL
4. ✓ Add startup env validation
5. ✓ Test actual connection from prod SWA

### **TIER 2 - DO BEFORE GOING LIVE (30 min)**
6. ✓ Implement auth in `/api/me` (parse x-ms-client-principal)
7. ✓ Add role-based access control to endpoints
8. ✓ Fix 401 response in staticwebapp.config.json (redirect to login)
9. ✓ Add post-deploy smoke test to workflow
10. ✓ Add database backup step to workflow

### **TIER 3 - URGENT (After live, within 24h)**
11. ✓ Wire Application Insights logging
12. ✓ Add email alerts on 500 errors
13. ✓ Add rate limiting
14. ✓ Validate Excel file uploads
15. ✓ Document backup/rollback procedure

---

## DECISION

**Can we deploy with TIER 1 + TIER 2 fixed?** 
- Yes, that's production-ready
- TIER 3 is for reliability/monitoring (needed but not blocking)

**Tier 1 + 2 fixes: ~1 hour of work**

---

## Next Steps

1. **Verify prod database connection** (5 min)
   - Check Azure Portal: is `shriyamining-db` the prod one?
   - Is connection string using prod database name?

2. **Fix auth implementation** (15 min)
   - Implement `/api/me` properly
   - Add role checks to endpoints
   - Update SWA config

3. **Fix CORS** (5 min)
   - Update server.js with prod SWA URL

4. **Add startup validation** (10 min)
   - Check required env vars
   - Verify database name

5. **Add smoke test** (15 min)
   - Create test script
   - Add to deploy workflow

6. **Add backup step** (5 min)
   - Update workflow with backup

**Total: ~1 hour to production-ready**

Want me to do this now?
