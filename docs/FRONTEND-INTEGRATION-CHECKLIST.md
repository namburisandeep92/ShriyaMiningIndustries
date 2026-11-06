# 🎨 Frontend Integration Checklist - Step 7 & Step 8 Preview

**Current Status**: Steps 1-5 Complete ✅ | Step 0 In Progress ⏳ | Step 6-7 Ready to Start ⏭️

This document explains what needs to be done for the UI (frontend) to work end-to-end with the new API.

---

## 📊 What the UI Will Do (Step 7)

Your chosen approach: **Keep Legacy HTML Structure** ✅

### Before (Legacy - Current)
- Single HTML page (`/legacy/index.html`)
- Upload Excel → Process in browser JavaScript → Download Excel
- No database
- No multi-user support
- No history/versions
- No error tracking

### After (New - Step 7)
- Same HTML/CSS/layout
- Same user interactions
- **BUT** backend operations call the API (Step 6)
  - Upload Excel → Send to `/api/po-import` → Store in DB
  - Create invoice → Call `/api/invoices` → Save to DB
  - Edit invoice → Call `/api/invoices/{id}` → Update in DB
  - Download Excel → Call `/api/invoices/{id}/export` → Get from DB
- Multi-user support
- Version history
- Error tracking
- User permissions

---

## 🔌 UI-to-API Integration Points

### 1. PO Import Workflow

**Current** (Legacy):
```
User uploads Excel
  ↓
Browser JavaScript parses file
  ↓
Display validation results in a table
  ↓
User clicks "Use these records"
  ↓
Store in browser memory
```

**New** (After Step 6-7):
```
User uploads Excel
  ↓
POST /api/po-import (send file + validation)
  ↓
API stores in shriyamining-db-test
  ↓
API returns validation results + import ID
  ↓
UI displays results (from API, not browser)
  ↓
User clicks "Create Invoice from PO"
  ↓
POST /api/invoices (send selected lines + import ID)
  ↓
API creates invoice, returns invoice ID + number
  ↓
UI displays: "Invoice SMI-2025-11-001 created"
```

**UI Changes Needed**:
```javascript
// OLD: document.getElementById('file').addEventListener('change', ...)
// NEW: need API client to POST /api/po-import

// OLD: validateExcelLocally(file)
// NEW: await apiClient.post('/po-import', { file })

// OLD: store results in globalState.records
// NEW: results come from API response, always from database
```

### 2. Create Invoice

**Current** (Legacy):
```
User fills form (vendor, buyer, date, notes)
  ↓
User adds line items by hand or from PO records
  ↓
Browser calculates totals, tax, amount-in-words
  ↓
Display preview (in browser)
```

**New** (After Step 6-7):
```
User fills form
  ↓
POST /api/invoices (send form + selected PO lines)
  ↓
API generates invoice number (SMI-YYYY-MM-NNN)
  ↓
API calculates totals, tax, amount-in-words
  ↓
API stores in database
  ↓
API returns full invoice object
  ↓
UI displays invoice with ID + number
  ↓
User can now edit, view history, export, delete
```

**UI Changes Needed**:
```javascript
// OLD: invoice.invoiceNumber = `SMI-${getDateString()}-${counter++}`
// NEW: invoice.invoiceNumber comes from API response

// OLD: calculateTotals(invoice) in browser
// NEW: totals come from API response

// OLD: download immediately
// NEW: GET /api/invoices/{id}/export to download from API
```

### 3. Edit Invoice (Concurrency)

**Current** (Legacy):
```
User edits invoice
  ↓
Save changes to browser memory
  ↓
Done
```

**New** (After Step 6-7):
```
User edits invoice (GET /api/invoices/{id})
  ↓
API returns invoice object + rowVersion (concurrency token)
  ↓
User changes fields
  ↓
PATCH /api/invoices/{id} (send changes + rowVersion)
  ↓
API checks: "Was this edited by someone else?"
  ↓
Case 1 - No conflict: API saves, returns 200 OK
  ↓
Case 2 - Conflict: API returns 409 Conflict (rowversion mismatch)
  ↓
UI shows: "Someone else edited this. Refresh to see their changes?"
```

**UI Changes Needed**:
```javascript
// OLD: save() { invoice.updatedAt = Date.now(); }
// NEW: const response = await apiClient.patch(
//   `/invoices/${id}`,
//   { ...changes, rowVersion: invoice.rowVersion },
//   { headers: { 'If-Match': invoice.rowVersion } }
// );
// if (response.status === 409) {
//   showMessage("Conflict: Someone else edited this");
//   reloadInvoice();
// }
```

### 4. View History & Export

**Current** (Legacy):
```
Not supported
```

**New** (After Step 6-7):
```
User clicks "View History"
  ↓
GET /api/invoices/{id}/versions
  ↓
API returns list of all versions with dates + who changed
  ↓
UI displays timeline
  ↓
User selects version
  ↓
GET /api/invoices/{id}/versions/{versionNumber}
  ↓
API returns that version's data
  ↓
User clicks "Export as Excel" or "Print PDF"
  ↓
GET /api/invoices/{id}/export?format=excel&version=v2
  ↓
API generates file, returns binary blob
  ↓
Browser downloads file
```

**UI Changes Needed**:
```javascript
// NEW: History button calls apiClient.get(`/invoices/${id}/versions`)
// NEW: Export button calls apiClient.get(`/invoices/${id}/export?format=excel`)
// NEW: Display version history timeline (new UI component)
```

---

## 🔐 Authentication & Permissions

### Step 6 API: Authentication

The API will:
1. Read `x-ms-client-principal` header (from Azure SWA auth)
2. Look up user in database
3. Load user's roles and permissions
4. Check permission on EVERY endpoint
5. Return 401 (not signed in) or 403 (no permission)

### UI: What Changes

**Current** (Legacy):
```
No authentication needed
Anyone can upload any Excel and create any invoice
```

**New** (After Step 6-7):
```
Azure SWA provides sign-in via Microsoft/Entra ID
↓
UI reads current user: window.appIdentity (from SWA built-in auth)
↓
API checks permissions on each call
↓
If user not in allow-list: API returns 403 Forbidden
↓
If user has "viewer" role: invoice export button is visible but create/edit are grayed out
↓
If user has "approver" role: can approve invoices (Phase 2)
```

**UI Changes Needed**:
```javascript
// NEW: Every API call includes auth headers automatically
// NEW: Handle 401 (sign in) and 403 (not allowed) responses
// NEW: Hide/disable buttons based on user.permissions array

// Example:
if (user.permissions.includes('INV_CREATE')) {
  showButton('Create Invoice');
} else {
  hideButton('Create Invoice');
}
```

---

## 🧪 Testing Strategy for UI

### Part 1: Existing Playwright Tests (Legacy)
- These will still run against the new UI
- Same test cases (upload → validate → create → export)
- But now they'll interact with the API, not in-browser processing
- **Important**: The test expectations (golden files) should NOT change if the outputs are identical

### Part 2: New Tests (Step 7)
- Test error scenarios (409 conflict, 403 forbidden, invalid Excel)
- Test multi-user scenarios (two users edit same invoice)
- Test version history (create version 1, edit to v2, confirm v1 is readable)
- Test permissions (viewer user cannot create, can only view)

### Example Test (New)
```javascript
test('should show 409 conflict when two users edit same invoice', async () => {
  // User A gets invoice
  const invoiceA = await apiClient.get('/invoices/123');
  
  // User B also gets it
  const invoiceB = await apiClient.get('/invoices/123');
  
  // User B saves first (wins)
  await apiClient.patch('/invoices/123', { notes: 'Changed by B' }, 
    { headers: { 'If-Match': invoiceB.rowVersion } });
  
  // User A tries to save (loses - gets 409)
  const response = await apiClient.patch('/invoices/123', 
    { notes: 'Changed by A' },
    { headers: { 'If-Match': invoiceA.rowVersion } }
  );
  
  expect(response.status).toBe(409);
  expect(response.body.errorCode).toBe('INV-UPDATE-409');
});
```

---

## 📋 UI/API Integration Checklist (For Step 7)

### Before Starting Step 7, Step 6 Must Provide

- [ ] `POST /api/po-import` - Upload and validate Excel
- [ ] `GET /api/po-import` - Search imported POs
- [ ] `POST /api/invoices` - Create invoice
- [ ] `GET /api/invoices` - Search invoices (with paging)
- [ ] `GET /api/invoices/{id}` - Get invoice with rowVersion
- [ ] `PATCH /api/invoices/{id}` - Update invoice (409 on conflict)
- [ ] `DELETE /api/invoices/{id}` - Soft delete
- [ ] `GET /api/invoices/{id}/versions` - Version history list
- [ ] `GET /api/invoices/{id}/versions/{versionNumber}` - Get specific version
- [ ] `GET /api/invoices/{id}/export` - Download as Excel/PDF

### During Step 7, UI Must

#### Core Functionality
- [ ] Import PO: Upload Excel → POST /api/po-import → Show results from API
- [ ] Create invoice: Form → POST /api/invoices → Show invoice number
- [ ] Edit invoice: Load from API → PATCH /api/invoices/{id} → Handle 409
- [ ] Export: GET /api/invoices/{id}/export?format=excel|pdf

#### Error Handling
- [ ] Show 401 error: "Sign in required"
- [ ] Show 403 error: "You don't have permission to do this"
- [ ] Show 409 error: "Someone else edited this. Refresh?"
- [ ] Show 400 error: "Invalid data: [details]"
- [ ] Show validation errors from API: Display per-field messages

#### Permissions & UI State
- [ ] Hide "Create" button if no INV_CREATE permission
- [ ] Hide "Edit" button if no INV_UPDATE permission
- [ ] Hide "Delete" button if no INV_DELETE permission
- [ ] Hide "Admin" section if no ADMIN permission
- [ ] Show user name + logout button (from SWA auth)

#### Version History (New)
- [ ] Display version timeline: V1, V2, V3...
- [ ] Show who edited and when
- [ ] "View" button to see version details
- [ ] "Export" button to download version as Excel/PDF
- [ ] "Reprint" button to reprint version (no signature changes)

#### Testing
- [ ] Playwright tests pass unchanged (golden files match)
- [ ] New tests for 409 conflict scenario
- [ ] New tests for permission denial (403)
- [ ] New tests for validation errors (400)
- [ ] Performance test: invoice list loads < 2s (warm DB)

---

## 🚀 Step 6 → Step 7 → Step 8 Flow

```
STEP 6 (API Implementation) - 6-8 hours
├─ Create 20 Azure Functions endpoints
├─ Implement stored procedure calls (safe, parameterized SQL)
├─ Error handling middleware (logs to DB + App Insights)
├─ OpenAPI/Swagger spec
├─ Deploy to swa-smi-invoice-test
├─ Swagger UI available at /api/docs
└─ All 95 existing tests still passing ✅

       ↓ (PR review & merge)

STEP 7 (Frontend) - 4-6 hours
├─ Keep legacy HTML structure
├─ Replace Excel upload with API call
├─ Replace create with API call
├─ Replace edit with API call (handle 409)
├─ Add version history UI
├─ Add permission-based button visibility
├─ Handle auth headers (SWA provides)
├─ Deploy to swa-smi-invoice-test
├─ Playwright tests pass unchanged
└─ All new tests passing ✅

       ↓ (PR review & merge)

STEP 8 (CI/CD + Branch Protection) - 2-3 hours
├─ Enable branch protection on main
├─ Configure auto-deployment on PR merge
├─ Run full test suite in CI (< 10 minutes)
├─ Smoke test on swa-smi-invoice-test
├─ Deploy to swa-smi-invoice-prod on main
└─ Production is now live ✅

       ↓

STEP 9 (Go-Live) - 2-3 hours
├─ Write setup guide for admins
├─ Document how to create users + roles
├─ Document how to view error logs + metrics
├─ Create admin checklist
└─ Ready for use ✅
```

---

## 🎯 Success Criteria for UI Integration

**By the end of Step 7, the UI should:**

✅ Look identical to the current `/legacy/` tool
✅ Support all current features (upload, create, export, print)
✅ Add new features (version history, multi-user safety)
✅ All existing Playwright tests pass without changes
✅ New tests for 409, 403, version history pass
✅ Performance: invoice list < 2s, invoice open < 2s
✅ Accessibility: axe-core scan has no "serious" issues
✅ Error handling: User-friendly messages for all error codes
✅ Permissions: Buttons hide based on user.permissions
✅ Deployment: Auto-deploys to test SWA on every PR

---

## ⚡ Quick Reference: API Responses

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "invoiceId": "abc123",
    "invoiceNumber": "SMI-2025-11-001",
    "status": "Draft",
    "lineItems": [...],
    "totalAmount": 50000,
    "rowVersion": "xyz789"  // Use this for PATCH If-Match
  }
}
```

### Error Response (Any Error)

```json
{
  "success": false,
  "error": {
    "code": "INV-UPDATE-409",  // Error code from catalogue
    "message": "Concurrent modification: rowversion mismatch",
    "correlationId": "7F3A-21C9",  // Show to user for support
    "statusCode": 409,
    "details": {
      "currentVersion": "abc123",
      "expectedVersion": "xyz789"
    }
  }
}
```

**UI Should Display**:
```
❌ Invoice could not be saved
Reason: Someone else edited this invoice
Reference: 7F3A-21C9
Action: [Reload] [Discard Changes]
```

---

## 🔄 Keep Legacy Tests Green

**Golden File Strategy**:
- Current tests compare: cell values, formulas, totals, amounts in words
- After API: Same comparisons, but data comes from DB instead of browser
- **Expected behavior**: Golden files should NOT change (if calculations are identical)

**Example Golden File Comparison**:
```javascript
// Test expects these values to match:
const legacy = await parseExcel('/legacy/output.xlsx');
const new = await parseExcel('/new/output.xlsx');

// Should be identical:
expect(new.sheet1.A1).toBe(legacy.sheet1.A1);  // Vendor name
expect(new.sheet1.B1).toBe(legacy.sheet1.B1);  // Invoice number
expect(new.sheet1.C5).toBe(legacy.sheet1.C5);  // Total amount
expect(new.sheet1.D6).toBe(legacy.sheet1.D6);  // Tax
```

---

## 📞 Before You Start Step 6

Make sure:

1. ✅ Step 0 is complete (GitHub Secrets configured)
2. ✅ Step 5 is complete (95 tests passing)
3. ✅ Architecture document is read (`/docs/architecture.md`)
4. ✅ Database schema is understood (4 schemas, 14 tables)
5. ✅ Error codes are reviewed (`database/migrations/V002_*.sql`)
6. ✅ The 95 tests understand the expected API contracts

---

**Ready?** Reply: "Ready for Step 6 API implementation." Let's build! 🚀
