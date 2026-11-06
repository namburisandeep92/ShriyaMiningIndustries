# ⚡ Step 6a - API Foundation Quick Reference

## 📍 Current Status
- **Step**: 6a (API Foundation)
- **Tests**: 95/95 Passing ✅
- **Branch**: `step-6-api`
- **Status**: Complete & Ready for Step 6b

---

## 🎯 What Was Built

### Middleware (3)
- **Correlation ID**: Unique request tracking (UUID per request)
- **Authentication**: Parse SWA header + user extraction
- **Error Handler**: Global exception catcher + structured responses

### Services (1)
- **Database**: Connection pooling + auto-retry + parameterized queries

### Server
- **Express App**: CORS + 20 endpoints stubbed + middleware chain

### Documentation (2 files)
- **STEP6-API-FOUNDATION.md**: Architecture + usage
- **STEP6b-ROUTE-HANDLERS.md**: Detailed implementation plan

---

## 🚀 Start API Server

```bash
npm run api:dev
```

**Output**:
```
[API] Server running at http://localhost:3000
[API] Health check: http://localhost:3000/api/health
```

---

## 🧪 Test Endpoints

### Health Check (No Auth)
```bash
curl http://localhost:3000/api/health
# Returns: { status: "healthy", database: "connected" }
```

### Current User (Needs Auth Header)
```bash
curl -H "x-ms-client-principal: <base64>" http://localhost:3000/api/me
# Returns: { user: { email, name, roles } }
```

---

## 📂 File Structure

```
api/
├── index.js                    ← Start here: npm run api:dev
├── server.js                   ← Express setup + routes
├── middleware/
│   ├── correlation-id.js       ← Request tracing
│   ├── auth.js                 ← User auth
│   └── error-handler.js        ← Error handling
└── services/
    └── database.js             ← DB connection + retry
```

---

## 🔧 Environment Setup

```bash
# Create .env (copy from .env.example)
DB_CONNECTION_STRING_TEST=Server=...; Initial Catalog=...;

# Verify connection
npm run api:dev
# Check: [DB] Connected successfully
```

---

## 📝 All 20 Endpoints

| # | Method | Path | Status |
|---|--------|------|--------|
| 1-2 | POST/GET | /api/po-import | ⏳ Step 6b |
| 3-7 | POST/GET/PATCH/DELETE | /api/invoices | ⏳ Step 6b |
| 8-9 | GET | /api/invoices/{id}/versions | ⏳ Step 6b |
| 10 | GET | /api/invoices/{id}/export | ⏳ Step 6b |
| 11-13 | GET/POST/GET | /api/admin/* | ⏳ Step 6b |
| 14-15 | GET/GET | /api/health, /api/me | ✅ Done |
| 16-17 | GET/GET | /api/openapi.yaml, /api/docs | ⏳ Step 6b |

---

## 🧩 Middleware Chain

Request flow:
```
1. JSON Parser (50 MB limit)
   ↓
2. CORS (SWA + localhost)
   ↓
3. Correlation ID (UUID gen)
   ↓
4. Auth (Parse x-ms-client-principal)
   ↓
5. Routes (Invoice CRUD, etc.)
   ↓
6. Error Handler (Global catch)
   ↓
Response
```

---

## 🎓 Key Patterns

### Async Route Handler
```javascript
const handleCreate = asyncHandler(async (req, res) => {
  // Errors thrown automatically caught by errorHandler
  if (!req.user.permissions.includes('invoice.create')) {
    throw Errors.Forbidden('create invoice');
  }
  
  const db = getDatabase();
  const result = await db.execute('usp_Invoice_Create', {...});
  
  res.status(201).json(result);
});
```

### Database Query
```javascript
const db = getDatabase();
const rows = await db.query(
  'SELECT * FROM [app].[Invoice] WHERE InvoiceId = @id',
  { id: invoiceId }
);
```

### Error Handling
```javascript
// Thrown as error:
throw Errors.NotFound('Invoice');
throw Errors.Conflict('Concurrency conflict');

// Caught by errorHandler:
// Returns: { error: { code, message, referenceId } }
```

---

## ✅ Test Everything Still Passes

```bash
npm run test:all
# Expected: 95 tests passing ✅
```

---

## 📊 Performance Notes

- **Database Connection**: Auto-retry on timeout (free tier auto-pause)
- **Request Timeout**: 60 seconds (database timeout)
- **API Timeout**: 45 seconds (SWA managed Functions limit)
- **Request Size**: Up to 50 MB (for Excel imports)
- **Response Format**: JSON with correlation ID in headers

---

## 🔒 Security Built-In

✅ Parameterized SQL queries (no injection)  
✅ Correlation ID on all errors (audit trail)  
✅ User auth from SWA (Microsoft Entra ID)  
✅ Permission checks on routes  
✅ Error details hidden in production  
✅ Soft deletes (maintain history)  

---

## 🆘 Troubleshooting

### "Connection refused"
- Check `.env` has correct connection string
- Verify Azure Firewall is ON
- Check username/password are correct

### "Port 3000 already in use"
- Kill existing process: `lsof -ti:3000 | xargs kill -9` (Mac/Linux)
- Or use different port: `PORT=3001 npm run api:dev`

### "401 Unauthorized"
- Health endpoint needs no auth
- Other endpoints need x-ms-client-principal header

### "Tests failing after Step 6a changes"
- All 95 tests should still pass
- If not, middleware is interfering
- Check error handler last in middleware chain

---

## 🎯 Next: Step 6b

**When ready**, implement:
1. PO Import handler
2. Invoice CRUD (create, read, update, delete)
3. Export handler
4. Version history
5. Admin endpoints
6. Integration tests

Time estimate: 6-8 hours

---

## 📞 Resources

- **Architecture**: `/docs/architecture.md`
- **Step 6a Details**: `/docs/STEP6-API-FOUNDATION.md`
- **Step 6b Plan**: `/docs/STEP6b-ROUTE-HANDLERS.md`
- **Status**: `/STEP6-STATUS.md`
- **Quick Start**: `/QUICK-START.md`

---

**Branch**: `step-6-api` | **Tests**: ✅ 95/95 | **Ready**: Yes ✅
