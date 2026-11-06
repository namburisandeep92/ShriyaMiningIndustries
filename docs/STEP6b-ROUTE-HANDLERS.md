# 📍 Step 6b: API Route Handlers (Ready to Build)

**Current Status**: Step 6a Complete ✅ | Step 6b Planning ⏳ | All 95 Tests Passing ✅

---

## Overview

Step 6b implements the actual API endpoints that the frontend will call. These handlers will:
- Call stored procedures already built in Step 5
- Use business logic utilities already tested in 48 unit tests
- Return structured responses with error handling
- Track requests with correlation IDs
- Validate permissions before returning data

**Estimated Work**: 6-8 hours  
**Complexity**: Medium (mostly database CRUD + error handling)  
**Testing**: Already have test contracts (18 API tests) - just need to implement

---

## Route Handlers to Implement

### 1. PO Import Handler (`api/functions/po-import.js`)

#### POST /api/po-import - Upload Excel PO

**Request**:
```json
{
  "file": <binary Excel data>,
  "vendorId": "VENDOR-001",
  "poNumber": "PO-2025-11-123"
}
```

**Response** (201 Created):
```json
{
  "importId": "IMP-2025-11-001",
  "vendorId": "VENDOR-001",
  "poNumber": "PO-2025-11-123",
  "status": "pending",
  "rowsImported": 15,
  "preview": [
    { "lineNum": 1, "productCode": "SM-001", "quantity": 10, "rate": 500 }
  ],
  "timestamp": "2025-11-06T17:18:34Z"
}
```

**Error Cases**:
- 400 - Missing file or invalid Excel format → Use `validateColumns()` utility
- 400 - Missing required vendor ID
- 409 - Duplicate PO number (already imported)
- 401 - Not authenticated
- 403 - User doesn't have `po.import` permission

**Implementation Steps**:
1. Validate file is Excel (check MIME type)
2. Parse Excel using ExcelJS
3. Extract columns using test data format (see `tests/fixtures/po/sample-po.xlsx`)
4. Call `invoiceUtils.validateColumns()` to check required columns present
5. Call `invoiceUtils.parseProductDescription()` for each product line
6. Insert via stored procedure: `usp_POImport_Create()`
7. Return import ID + preview data

**Code Template**:
```javascript
const handlePOImport = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { vendorId, poNumber } = req.body;
  const file = req.files?.file;

  // Validate input
  if (!file || !vendorId) throw Errors.InvalidInput('file and vendorId required');
  if (!req.user.permissions.includes('po.import')) throw Errors.Forbidden('upload PO');

  // Parse Excel
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.data);
  const worksheet = workbook.worksheets[0];

  // Extract rows
  const columns = worksheet.getRow(1).values;
  if (!invoiceUtils.validateColumns(columns)) {
    throw Errors.InvalidColumns(REQUIRED_COLUMNS);
  }

  // Process each row
  const items = [];
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i).values;
    const product = invoiceUtils.parseProductDescription(row[3]); // Assuming col C
    items.push({ lineNum: i - 1, ...product, quantity: row[4], rate: row[5] });
  }

  // Insert via stored procedure
  const db = getDatabase();
  const result = await db.execute('usp_POImport_Create', {
    correlationId,
    vendorId,
    poNumber,
    importedByEmail: req.user.email,
    rowsJson: JSON.stringify(items),
  });

  res.status(201).json({
    importId: result.recordset[0].ImportId,
    vendorId,
    poNumber,
    status: 'pending',
    rowsImported: items.length,
    preview: items.slice(0, 5),
    timestamp: new Date().toISOString(),
  });
});
```

---

### 2. Invoice CRUD Handlers (`api/functions/invoice-crud.js`)

#### POST /api/invoices - Create Invoice

**Request**:
```json
{
  "vendorId": "VENDOR-001",
  "buyerId": "BUYER-001",
  "items": [
    {
      "description": "Steel (50x100 mm)",
      "quantity": 5,
      "rate": 1000,
      "taxRate": 0.18
    }
  ]
}
```

**Response** (201 Created):
```json
{
  "invoiceId": "INV-2025-11-001",
  "invoiceNumber": "SMI-2025-11-001",
  "vendorId": "VENDOR-001",
  "status": "draft",
  "totalAmount": 5900,
  "rowVersion": "0x000000000000001A",
  "createdOn": "2025-11-06T17:18:34Z",
  "createdBy": "user@example.com"
}
```

**Error Cases**:
- 400 - Invalid items (missing quantity, rate, etc.)
- 400 - Invalid tax rates (must be 0-100)
- 401 - Not authenticated
- 403 - User doesn't have `invoice.create` permission
- 409 - Duplicate invoice (shouldn't happen with auto-numbering, but check business rule)

**Implementation**:
1. Validate request body (check required fields)
2. Validate each item using utility functions:
   - `validateColumns()` for structure
   - `calculateLineAmount()` for math
   - `calculateTax()` for tax
3. Call stored procedure: `usp_Invoice_Create()` with CorrelationId
4. Handle concurrency: If rowVersion conflict, return 409
5. Return invoice ID + auto-generated invoice number

---

#### GET /api/invoices - List Invoices (with Paging & Filtering)

**Query Parameters**:
```
?status=draft&vendorId=VENDOR-001&page=1&pageSize=50&sortBy=CreatedOn&sortOrder=desc
```

**Response** (200 OK):
```json
{
  "invoices": [
    {
      "invoiceId": "INV-2025-11-001",
      "invoiceNumber": "SMI-2025-11-001",
      "vendorId": "VENDOR-001",
      "totalAmount": 5900,
      "status": "draft",
      "createdOn": "2025-11-06T17:18:34Z",
      "createdBy": "user@example.com"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalCount": 127,
    "totalPages": 3
  }
}
```

**Implementation**:
1. Parse query parameters (status, vendorId, page, pageSize)
2. Build WHERE clause with filters
3. Call stored procedure: `usp_Invoice_GetList()` with paging
4. Calculate pagination metadata
5. Return invoice list

---

#### GET /api/invoices/:id - Get Single Invoice

**Response** (200 OK):
```json
{
  "invoiceId": "INV-2025-11-001",
  "invoiceNumber": "SMI-2025-11-001",
  "vendorId": "VENDOR-001",
  "vendor": {
    "name": "Vendor Name",
    "gstin": "27AAACR5055K1ZO"
  },
  "buyerId": "BUYER-001",
  "items": [
    {
      "lineId": "IL-001",
      "description": "Steel (50x100 mm)",
      "quantity": 5,
      "rate": 1000,
      "amount": 5000,
      "tax": 900,
      "taxRate": 0.18
    }
  ],
  "totals": {
    "subtotal": 5000,
    "tax": 900,
    "total": 5900
  },
  "status": "draft",
  "rowVersion": "0x000000000000001A",
  "createdOn": "2025-11-06T17:18:34Z",
  "createdBy": "user@example.com",
  "modifiedOn": "2025-11-06T17:19:00Z",
  "modifiedBy": "user@example.com"
}
```

**Error Cases**:
- 404 - Invoice not found
- 401 - Not authenticated
- 403 - User doesn't have permission to view this invoice

**Implementation**:
1. Parse invoiceId from URL
2. Call stored procedure: `usp_Invoice_GetById()` with CorrelationId
3. Enrich response with vendor details (name, GSTIN)
4. Calculate totals using utility functions
5. Return full invoice details including rowVersion (needed for update)

---

#### PATCH /api/invoices/:id - Update Invoice

**Request**:
```json
{
  "items": [
    { "lineId": "IL-001", "quantity": 6, "rate": 1000 }
  ],
  "status": "submitted",
  "rowVersion": "0x000000000000001A"  // REQUIRED - for concurrency control
}
```

**Response** (200 OK):
```json
{
  "invoiceId": "INV-2025-11-001",
  "invoiceNumber": "SMI-2025-11-001",
  "status": "submitted",
  "totalAmount": 6180,
  "rowVersion": "0x000000000000001B",  // Updated!
  "modifiedOn": "2025-11-06T17:19:30Z",
  "modifiedBy": "user@example.com"
}
```

**Conflict Case** (409 Conflict):
```json
{
  "error": {
    "code": "INV-CONFLICT-409",
    "message": "This invoice has been modified by another user. Please refresh and try again.",
    "referenceId": "abc-123-def",
    "currentRowVersion": "0x000000000000001C",
    "yourRowVersion": "0x000000000000001A"
  }
}
```

**Implementation**:
1. Validate rowVersion is provided (required for optimistic locking)
2. Validate request body
3. Call stored procedure: `usp_Invoice_Update()` with current rowVersion
4. If stored proc returns error code for rowVersion mismatch, return 409
5. Return updated invoice with new rowVersion

---

#### DELETE /api/invoices/:id - Soft Delete Invoice

**Request**: No body required

**Response** (204 No Content)

**Implementation**:
1. Call stored procedure: `usp_Invoice_Delete()` with CorrelationId
2. Performs soft delete (sets IsDeleted = 1)
3. Maintains audit trail

---

### 3. Export Handler (`api/functions/invoice-export.js`)

#### GET /api/invoices/:id/export - Download Invoice as Excel/PDF

**Query Parameters**:
```
?format=excel    // or "pdf"
?version=1       // optional - export specific version
```

**Response**:
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="SMI-2025-11-001.xlsx"

<binary Excel data>
```

**Implementation**:
1. Parse invoiceId and format
2. Call stored procedure to get invoice data (or version data)
3. Use ExcelJS or PDFKit to generate file
4. Use mock classes from `tests/output/files.test.js`
5. Stream response with appropriate headers
6. Handle large files (use streaming for > 1 MB)

---

### 4. Version History Handlers (`api/functions/invoice-history.js`)

#### GET /api/invoices/:id/versions - List All Versions

**Response** (200 OK):
```json
{
  "invoiceId": "INV-2025-11-001",
  "invoiceNumber": "SMI-2025-11-001",
  "versions": [
    {
      "version": 1,
      "status": "draft",
      "totalAmount": 5000,
      "modifiedOn": "2025-11-06T17:18:34Z",
      "modifiedBy": "user@example.com",
      "changeDescription": "Initial creation"
    },
    {
      "version": 2,
      "status": "submitted",
      "totalAmount": 5900,
      "modifiedOn": "2025-11-06T17:19:00Z",
      "modifiedBy": "user@example.com",
      "changeDescription": "Status changed to submitted"
    }
  ]
}
```

**Implementation**:
1. Call stored procedure: `usp_Invoice_GetHistory()` to list all versions
2. Return version list with metadata

---

#### GET /api/invoices/:id/versions/:version - Get Specific Version

**Response** (200 OK):
```json
{
  "version": 1,
  "invoiceNumber": "SMI-2025-11-001",
  "items": [...],
  "totals": {...},
  "status": "draft",
  "modifiedOn": "2025-11-06T17:18:34Z",
  "modifiedBy": "user@example.com"
}
```

**Use Cases**:
- Reprint old version of invoice
- Compare two versions
- Audit trail

**Implementation**:
1. Call stored procedure: `usp_Invoice_GetVersion()` to retrieve historical data
2. Return complete invoice structure for that version

---

### 5. Admin Handlers (`api/functions/admin.js`)

#### GET /api/admin/users - List Users

**Query Parameters**:
```
?role=admin&status=active&page=1&pageSize=50
```

**Response** (200 OK):
```json
{
  "users": [
    {
      "userId": "USR-001",
      "email": "user@example.com",
      "name": "John Doe",
      "roles": ["invoices.create", "invoices.approve"],
      "status": "active",
      "createdOn": "2025-11-06T00:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

**Permission Required**: `user.admin.read`

**Implementation**:
1. Check permission: `requirePermission('user.admin.read')`
2. Call stored procedure: `usp_User_GetList()` with filtering + paging
3. Return user list

---

#### POST /api/admin/users - Create User

**Request**:
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "roles": ["invoices.create"]
}
```

**Response** (201 Created):
```json
{
  "userId": "USR-002",
  "email": "newuser@example.com",
  "name": "New User",
  "roles": ["invoices.create"],
  "status": "active",
  "createdOn": "2025-11-06T17:18:34Z"
}
```

**Permission Required**: `user.admin.write`

**Implementation**:
1. Check permission
2. Validate email format
3. Call stored procedure: `usp_User_Create()`
4. Assign roles using: `usp_User_AssignRole()`
5. Return new user

---

#### GET /api/admin/error-log - Search Error Log

**Query Parameters**:
```
?errorCode=INV-SAVE-409&userId=user@example.com&from=2025-11-01&to=2025-11-06&page=1
```

**Response** (200 OK):
```json
{
  "errors": [
    {
      "errorLogId": "ERR-001",
      "errorCode": "INV-SAVE-409",
      "title": "Invoice Save Conflict",
      "userMessage": "This invoice has been modified by another user",
      "userId": "user@example.com",
      "correlationId": "abc-123-def",
      "timestamp": "2025-11-06T17:18:34Z"
    }
  ],
  "pagination": { ... }
}
```

**Permission Required**: `error.log.read`

**Implementation**:
1. Check permission
2. Parse query parameters (errorCode, userId, date range, paging)
3. Call stored procedure: `usp_ErrorLog_GetList()` with filters
4. Return error log with pagination

---

## Implementation Checklist

### Phase 1: Core CRUD (4 hours)
- [ ] POST /api/invoices (create)
- [ ] GET /api/invoices (list)
- [ ] GET /api/invoices/:id (get)
- [ ] PATCH /api/invoices/:id (update with 409 conflict)
- [ ] DELETE /api/invoices/:id (soft delete)
- [ ] Tests for each endpoint (error cases, permissions)

### Phase 2: PO Import & Export (2 hours)
- [ ] POST /api/po-import (file upload + parsing)
- [ ] GET /api/po-import (list imports)
- [ ] GET /api/invoices/:id/export (Excel/PDF download)
- [ ] Tests for file handling, error cases

### Phase 3: History & Admin (1 hour)
- [ ] GET /api/invoices/:id/versions (list)
- [ ] GET /api/invoices/:id/versions/:v (detail)
- [ ] GET /api/admin/users (list)
- [ ] POST /api/admin/users (create)
- [ ] GET /api/admin/error-log (search)
- [ ] Tests for pagination, filtering

### Phase 4: Integration Tests (1 hour)
- [ ] Test real database connection (with retry)
- [ ] Test permission checks (403 Forbidden)
- [ ] Test concurrency (409 Conflict)
- [ ] Test error logging (correlation ID)
- [ ] Test error handling (500 on DB failure)

---

## Files to Create

```
api/functions/
├── po-import.js           ← PO upload + parsing (~150 lines)
├── invoice-crud.js        ← Create, read, update, delete (~400 lines)
├── invoice-export.js      ← Excel/PDF generation (~200 lines)
├── invoice-history.js     ← Versions, reprints (~100 lines)
└── admin.js               ← Users, error log (~200 lines)

tests/api/integration/     ← NEW
├── po-import.test.js      ← Test file upload + parsing
├── invoice-crud.test.js   ← Test CRUD + concurrency
├── invoice-export.test.js ← Test Excel/PDF export
├── invoice-history.test.js← Test version retrieval
└── admin.test.js          ← Test user + error log search
```

---

## Database Stored Procedures Called

All procedures accept `CorrelationId` as first parameter:

```sql
-- Invoice Management
usp_Invoice_Create(
  @correlationId, @vendorId, @buyerId, @itemsJson, 
  @invoiceNumber OUT, @invoiceId OUT
)

usp_Invoice_Update(
  @correlationId, @invoiceId, @itemsJson, @status, @rowVersion
)
-- Returns 409 error if @rowVersion doesn't match current

usp_Invoice_Delete(@correlationId, @invoiceId)

usp_Invoice_GetList(
  @correlationId, @status, @vendorId, @pageNum, @pageSize
)
-- Returns: InvoiceId, InvoiceNumber, VendorId, TotalAmount, Status, ...

usp_Invoice_GetById(@correlationId, @invoiceId)
-- Returns: Complete invoice with all items + totals

usp_Invoice_GetHistory(@correlationId, @invoiceId)
-- Returns: List of all versions

usp_Invoice_GetVersion(@correlationId, @invoiceId, @version)
-- Returns: Specific version for reprinting

-- PO Import
usp_POImport_Create(
  @correlationId, @vendorId, @poNumber, @importedByEmail, @rowsJson
)

usp_POImport_GetList(
  @correlationId, @vendorId, @pageNum, @pageSize
)

-- User Management
usp_User_GetList(@correlationId, @role, @status, @pageNum, @pageSize)

usp_User_Create(@correlationId, @email, @name)
-- Returns: @userId

usp_User_AssignRole(@correlationId, @userId, @roleName)

-- Error Log
usp_ErrorLog_GetList(
  @correlationId, @errorCode, @userId, @fromDate, @toDate, 
  @pageNum, @pageSize
)
```

All procedures:
- Validate input + return 400 errors
- Check authorization + return 403 errors
- Use parameterized queries (safe from injection)
- Log errors + return 500 errors
- Support distributed tracing with CorrelationId

---

## Testing Strategy

### Unit Tests (Already Have 48) ✅
- Business logic: parsing, calculations, formatting
- No HTTP, no DB, no side effects

### API Contract Tests (Already Have 18) ✅
- Request/response validation using MockInvoiceAPI
- Error handling without real DB

### NEW: Integration Tests (~20 tests)
- Call REAL API endpoints
- Use REAL database (test DB)
- Test concurrency (409 Conflict)
- Test permissions (403 Forbidden)
- Test error logging (correlation ID)
- Test database retry (auto-pause wake-up)

**Example**:
```javascript
test('CRUD-009: Update invoice with 409 Conflict on rowVersion mismatch', async () => {
  // Create invoice
  const created = await api.POST('/invoices', {...});
  const rowVersion1 = created.rowVersion;

  // Update it (changes rowVersion)
  await api.PATCH(`/invoices/${created.id}`, {
    status: 'submitted',
    rowVersion: rowVersion1
  });

  // Try to update again with OLD rowVersion
  const result = await api.PATCH(`/invoices/${created.id}`, {
    status: 'approved',
    rowVersion: rowVersion1  // OLD!
  });

  expect(result.status).toBe(409);
  expect(result.error.code).toBe('INV-CONFLICT-409');
  expect(result.error.currentRowVersion).toBeDefined();
});
```

---

## Deployment Checklist (End of Step 6b)

- [ ] All 20 endpoint handlers implemented
- [ ] ~20 integration tests added + passing
- [ ] All 95 existing tests still passing (no regression)
- [ ] GitHub Actions CI/CD passes
- [ ] Deployed to swa-smi-invoice-test
- [ ] Swagger UI shows all endpoints
- [ ] Database permissions verified (read, write, admin)
- [ ] Error logging working (correlation ID in responses)
- [ ] Concurrency handling tested (409 on update conflict)
- [ ] PR to main with detailed description

---

## Questions to Answer

Before starting Step 6b, clarify:

1. **PO Import Strategy**:
   - Should large imports (> 1 MB) be chunked to fit 45-second timeout?
   - Or stream to database in chunks?
   - Or require small files (< 100 rows)?

2. **Invoice List Pagination**:
   - Default page size: 50? 100? 500?
   - Allow custom page size, or fixed?
   - Always return total count, or just hasMore?

3. **Delete Behavior**:
   - Soft delete (IsDeleted = 1) or hard delete?
   - Can deleted invoices be restored by admin?
   - Should they appear in list queries?

4. **Version History**:
   - Store before/after values for each field, or just summary?
   - Limit history retention (e.g., keep last 10 versions only)?
   - Auto-delete after 1 year?

5. **OpenAPI Spec**:
   - Auto-generate from route definitions (using decorators)?
   - Or hand-write YAML (easy to maintain)?
   - Include request/response examples?

---

## Next: Ready for Step 6b?

Reply with:
- **"Ready for Step 6b"** → I'll implement all route handlers
- **"Need clarification on [X]"** → I'll explain further
- **"Different approach for [Y]"** → Let's discuss trade-offs

Estimated completion: 1 session (6-8 hours work)

All 95 tests still passing ✅  
No blockers ✅  
Database stored procedures ready ✅  

Let's build! 🚀
