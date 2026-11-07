# SMI Invoice Platform - Database Layer

SQL Server schema, migrations, and application procedure contracts.

## Structure

```
database/
├── migrations/           # SQL migration files (Flyway convention)
│   ├── V001__schemas.sql           # Create all schemas and tables
│   ├── V002__seed-error-codes.sql  # Error code catalogue
│   ├── V003__seed-initial-data.sql # Roles, permissions, test data
│   ├── V004__api-contract-data.sql # Invoice taxes, PO metadata, version snapshots
│   ├── V005__legacy-invoice-document.sql # Complete PO invoice document, precise rates
│   ├── R__error-handling.sql       # Logging and legacy procedure signatures
│   └── R__platform-procedures.sql  # Complete API procedure contracts
├── migration-runner.js             # Node.js migration runner (mssql dependency)
├── logs/                           # Migration logs
└── seed/                           # (Reserved for future seed scripts)
```

## Design Principles

### Zero-Cost Azure Architecture
- **Schemas**: security, app, sales, log (organized by domain)
- **Phase 1 Tables**: 
  - `security.User`, `security.Role`, `security.Permission`, `security.RolePermission`, `security.UserRole`
  - `app.Vendor`, `app.Buyer`, `app.Invoice`, `app.InvoiceLine`, `app.InvoiceHistory`
  - `sales.POImportBatch`, `sales.POLine`
  - `log.ErrorLog`, `log.ErrorCode`, `log.ApplicationEvent`
- **Audit Columns** (on every table):
  - `CreatedOn` (UTC datetime, default GETUTCDATE())
  - `CreatedBy` (nvarchar(255), email)
  - `ModifiedOn` (UTC datetime)
  - `ModifiedBy` (nvarchar(255))
  - `IsDeleted` (bit, soft delete, default 0)
  - `RowVersion` (binary(8), SQL Server managed, for first-write-wins concurrency)

### Master/History Pattern
- `app.Invoice` stores current state only
- Invoice procedures write header audit entries to `app.InvoiceHistory`.
- `app.InvoiceSnapshot` stores immutable header and line JSON for each version.
- Existing invoices are backfilled at their current version only. Earlier line
  details cannot be reconstructed; requesting an unavailable version returns 404.

### Concurrency Control: First-Write-Wins
- Every table has `RowVersion ROWVERSION` (auto-managed by SQL Server)
- Stored procedures check rowversion before UPDATE
- The API returns the 8-byte token as 16 hexadecimal characters. Updates require
  that exact token in `X-Row-Version` or the body `rowVersion`.
- A stale token returns 409 Conflict.
- This prevents lost updates in concurrent scenarios

### Error Handling: Three-Layer Design
- **Database Layer**: transactional writes use SET XACT_ABORT ON and TRY/CATCH.
- **API Layer**: Catches SQL errors, returns HTTP status codes (409, 404, 500)
- **Client Layer**: Displays user-friendly messages from error catalogue

## Migrations

### Versioned Migrations (V###__name.sql)
Run once in order. Idempotent checks prevent re-running.
- `V001__schemas.sql`: Creates __MigrationHistory table, all schemas, tables, and indexes
- `V002__seed-error-codes.sql`: Inserts 18 error codes with user messages and resolution steps
- `V003__seed-initial-data.sql`: Seeds roles, permissions, test vendor/buyer, and preflight check
- `V004__api-contract-data.sql`: Adds invoice-line taxes, PO number metadata and invoice snapshots
- `V005__legacy-invoice-document.sql`: Preserves all legacy invoice header/line
  fields in checked `Invoice.DocumentJson`, expands buyer PO numbers and
  retains rates to six decimal places. Existing invoices remain unchanged.

Versioned migrations are recorded once and must never be forcibly removed from
`__MigrationHistory`. Schema creation uses existence checks, not table drops.
Deployments preserve invoices, users, custom roles, and role assignments.

### Repeatable Migrations (R__name.sql)
Run every time. Idempotent by design (CREATE OR ALTER).
- `R__error-handling.sql`: Logging and legacy invoice procedures
- `R__platform-procedures.sql`: Schema-qualified invoice CRUD/list/history/version,
  PO import/list, user list/create/role assignment/delete, and error-log list.
  It runs after the legacy repeatable so the API contracts remain authoritative.

Versioned migrations track completion in `__MigrationHistory`; repeatables run
every deployment. Apply V004 and V005 before the platform repeatable.

## PO to invoice workflow

The PO Import page follows [the legacy generator](../legacy/Invoice_Generator.html):
upload PendingOrders, search/filter/select rows, review/edit the selected
invoice, correct highlighted errors, preview and save/download. The supplied
[PendingOrders fixture](../tests/fixtures/po/SHRIYA_MINING_INDUSTRIES_PendingOrders.xlsx)
has 82 lines and 11 columns; uploads return all lines, not a five-row sample.
Uploading/previewing does not create an invoice or import batch. Both
`POST /api/po-import` and `/api/po-import/parse` only read the file and return
its rows. The obsolete six-column invoice-heading check is removed from both.
Required invoice fields are checked only after selecting **Create invoice**
and when saving/exporting, not while uploading. Even incomplete source columns
can be displayed and corrected in review. Unreadable/empty/oversized files
remain upload errors; historical import batches remain available via GET.

Header defaults, item parsing, rate defaults, USD calculations, integer
quantity/crate validation, sequential crate ranges, editable amount words,
shipping fields and both `INV`/`PACKING` sheets derive from the legacy source.
PDF uses its two-page A4 print layout: choose **Save as PDF** in the print
dialog. Saved documents and their immutable versions preserve every field.
Reopening **Edit** on a PO invoice returns to the detailed editor.
New PO invoices default to crate start **1001**. Each line's range is computed
from its crate count and the preceding counts; changing a count recalculates
all subsequent ranges. Existing/edited starting numbers are retained.
The import table freezes the selection checkbox and `SPS Item` columns, with
both heading/filter rows sticky. Line editing freezes the combined Stone/PO
reference column and its heading, matching the legacy editor.
Azure Functions explicitly treats XLSX/PDF responses as binary; sending them
as UTF-8 text corrupts bytes and causes gateway/backend download failures.
If download fails after saving, the editor reports that the invoice is already
saved and retrying downloads does not create another invoice.

Intentional differences from legacy:
- A database vendor/buyer association and invoice-create/update permission
  are required for **Save & download**, not for PO parsing or preview.
  Documents are saved in the cloud rather than the disabled legacy ledger.
- Supported inputs are `.xlsx` and `.csv`; convert old binary `.xls` files
  to `.xlsx`. No CDN scripts are loaded.
- Invoice numbers are unique and limited to the database's 20 characters;
  dates must be real calendar dates, rates have at most six decimals, and
  unsafe/oversized numeric values are blocked rather than rounded silently.
  Legacy-required fields remain required; optional weights may be blank.
- The legacy invoice formula mistakenly multiplied quantity by **weight**.
  Monetary cells now contain the correctly rounded quantity-times-rate
  amount; totals still use SUM formulas. Packing-sheet amounts likewise
  match the PDF and invoice instead of repeating weight under the USD label.
  Decimal rounding matches SQL exactly (e.g. 7 × 1.005 = 7.04), avoiding binary
  floating-point under-rounding in preview versus saved totals.
- Re-selecting rows retains header and line edits, while updating PO numbers
  and dates. Preview is invalidated immediately after any edit.

Tests: `npx vitest run tests/api/legacy-invoice.test.js`.
Guarded real-SQL verification:
`SMI_LIVE_DB_TEST=test npx vitest run tests/db/platform-live.test.js`.
The latter creates uniquely named fixtures only in `shriyaminingdbtest` and
cleans them up; it never writes to production.
For the browser-driven upload/selection/edit/preview/XLSX download/PDF output
and reopen test, also set `SMI_BROWSER_TEST=test`. It starts a temporary Vite
server connected to the real API/Test SQL fixture and closes it after testing.
It uses installed Microsoft Edge by default; set `SMI_BROWSER_CHANNEL=chrome`
to use installed Chrome instead.

Production uses `shriyaminingdb`; test uses `shriyaminingdbtest`.
Azure Overview confirms the resource/hostname mapping:

| Environment | Azure resource | URL | Database |
|---|---|---|---|
| Production | `swa-smi-invoice-prod` | https://victorious-grass-078778700.3.azurestaticapps.net | `shriyaminingdb` |
| Test | `swa-smi-invoice-test` | https://nice-water-0523f0500.3.azurestaticapps.net | `shriyaminingdbtest` |

The hostname-matched workflows use the corresponding frontend mode and
PROD/TEST migration secret. Runtime connection initialization checks `DB_NAME()`
against `ENVIRONMENT` and refuses cross-environment databases. Health responses
include the verified `databaseName`; deployment smoke tests check both that
catalog and the environment, not just HTTP 200.

The deployment workflows validate the exact connection-string catalog before
running migrations. Obsolete hyphenated names and cross-environment targets
fail validation instead of producing a warning. The private local `.env`,
GitHub migration secrets, and Azure runtime settings are separate configuration
sources; changing the template does not update deployed secrets/settings.

### API contracts

- Procedures returning invoice data return the header in resultset 1 and lines
  in resultset 2. Paged procedures return rows then a separate `TotalCount`,
  including for empty and out-of-range pages.
- Invoice creation requires an existing vendor and buyer, invoice date, and at
  least one line. Invoice identity fields are fixed after creation; edits update
  lines, notes, and status.
- Supported statuses are `Draft -> In Review -> Approved -> Shipped`; approval
  requires `invoice.approve` as well as edit permission. The UI uses lowercase
  labels, not the unsupported ready/sent/paid states.
- Line amounts and taxes are rounded to two decimal places in SQL.
- PO imports accept JSON containing `vendorId`, `poNumber`, `fileName` and a
  base64 `.xlsx` `file`. Required headings: Line Number, Product Code,
  Description, Quantity, Unit Rate, Tax Rate. Invalid rows reject the whole
  request. A successful import creates a completed PO batch, not an invoice.
- Users are created with roles atomically. `/api/admin/roles` supplies active
  database roles (including custom roles). Deletion is soft and self-deletion
  is rejected. Admin endpoints still require the database-backed Admin role.
- SQL errors 50400/50404/50409 map to HTTP 400/404/409. Unknown SQL errors remain
  server errors; technical details are logged, not exposed publicly.
- Excel and PDF exports return real workbook/PDF bytes.

### Live contract verification (test database only)

The regular suite skips live SQL tests. For explicit verification, populate the
private root `.env` with `DB_TEST_HOST`, `DB_TEST_NAME`, `DB_TEST_USER`, and
`DB_TEST_PASSWORD`, then run in PowerShell:

```powershell
$env:SMI_LIVE_DB_TEST = 'test'
npx vitest run tests\db\platform-live.test.js --reporter=verbose
Remove-Item Env:\SMI_LIVE_DB_TEST
```

The suite verifies both configured and connected catalogs are
`shriyaminingdbtest`, applies additive/repeatable migrations, exercises actual
HTTP requests and authorization, reruns schema/procedures to check preservation,
and removes only its uniquely identified fixture records. It never connects to
production or resets existing roles.

## Running Migrations

### Local Development (requires SQL Server or Azure SQL)
```bash
# Set connection string
export DB_CONNECTION_STRING="Server=tcp:shriyamining-sql.database.windows.net;Initial Catalog=shriyaminingdbtest;..."
export DB_USER="user@domain"
export DB_PASSWORD="password"

# Run migrations
node database/migration-runner.js

# Dry run (see what would execute)
node database/migration-runner.js --dry-run
```

### Azure CI/CD (GitHub Actions)
```yaml
# In workflow file
env:
  DB_CONNECTION_STRING: ${{ secrets.DB_CONNECTION_STRING }}
  DB_USER: ${{ secrets.DB_USER }}
  DB_PASSWORD: ${{ secrets.DB_PASSWORD }}

run: npm install && node database/migration-runner.js
```

### Local SQL Server Container (CI testing, free)
```bash
# Start SQL Server container (Linux, free tier)
docker run -e ACCEPT_EULA=Y -e SA_PASSWORD=YourSecurePassword123 \
  -p 1433:1433 \
  mcr.microsoft.com/mssql/server:2022-latest

# Connect and run migrations (in CI pipeline, not local)
npm install && node database/migration-runner.js
```

## Key Stored Procedures

### `app.usp_Invoice_Create`
Creates new invoice with auto-generated invoice number (SMI-YYYY-MM-NNN format).
- Counts existing invoices for month
- Generates next sequence number
- Checks for duplicate (409 if conflict)
- Sets audit columns
- Logs to ApplicationEvent

**Returns**: InvoiceId, InvoiceNumber

**Error Codes**: INV-SAVE-409 (duplicate), INV-SAVE-ERROR (unexpected)

### `app.usp_Invoice_UpdateStatus`
Updates invoice status with first-write-wins concurrency control.
- Validates rowversion matches current
- Records history before update
- Updates status and increments version
- Returns 409 if concurrent modification detected

**Error Codes**: INV-UPDATE-409 (concurrency), INV-UPDATE-ERROR (unexpected)

### `app.usp_Invoice_GetVersionHistory`
Retrieves all status changes for an invoice (audit trail).

**Error Codes**: INV-QUERY-404 (not found), INV-QUERY-ERROR (unexpected)

### `log.usp_ErrorLog_Insert`
Called by every stored procedure's CATCH block.
- Logs SQL error details (error number, line, message)
- Logs context (user, IP, request path)
- Used for troubleshooting and compliance

### `log.usp_ErrorLog_Purge`
Retention policy enforcement (called nightly).
- Soft-deletes Info/Warning errors older than 90 days
- Soft-deletes Error/Critical older than 1 year
- Keeps production database trim within free tier

## Error Code Catalogue

All error codes seeded in `log.ErrorCode` table. 

**Format**: [DOMAIN]-[ACTION]-[TYPE]
- `INV-SAVE-409`: Invoice save, duplicate
- `INV-UPDATE-409`: Invoice update, concurrent modification
- `AUTH-UNAUTHORIZED`: Missing permission
- `FILE-UPLOAD-422`: Invalid file structure
- `VAL-QTY-INVALID`: Quantity validation failed
- `DB-DEADLOCK`: SQL deadlock (retry recommended)
- etc.

Each error has:
- `Title`: Short error name
- `Description`: Technical details
- `UserMessage`: What to show the user
- `Severity`: Critical, Error, Warning, Info
- `HowToFix`: Resolution steps
- `WhereToLook`: Log location for debugging

See `/docs/error-codes.md` (auto-generated from seed data).

## Testing

### Database Unit Tests (tests/db/database.test.js)
Mock database layer testing (no SQL Server needed for development).

```bash
npm run test:db
```

Tests verify:
- ✅ Invoice creation with SMI-YYYY-MM-NNN auto-numbering (DB-FC-031)
- ✅ Concurrency detection: rowversion mismatch returns 409 (DB-FC-032)
- ✅ Audit columns populated correctly (DB-FC-024)
- ✅ Version history tracking all status changes (DB-FC-025)
- ✅ Error logging works (DB-FC-044)

### Integration Tests (CI pipeline)
SQL Server container runs real migrations + tSQLt tests.
- Idempotence: run migrations twice, verify same state
- Concurrency: simulate two updates, verify 409 conflict
- Constraints: attempt invalid data, verify rejection

## Constraints & Naming Standards

All constraints follow naming convention: `[PK|FK|UQ|CK|IX]_[TableName]_[ColumnList]`

Examples:
- `PK_Invoice_InvoiceId`
- `FK_InvoiceLine_InvoiceId`
- `UQ_Invoice_InvoiceNumber`
- `CK_Invoice_Status`
- `IX_Invoice_CreatedOn`

## Security

### Row-Level Security (Future: Phase 2)
- Users can see only invoices created by them or assigned to them
- Approvers see invoices in their queue
- Admins see everything

### Least-Privilege Application User (Future)
- Database login: `smi_app_user` (read/execute only)
- Cannot INSERT/UPDATE/DELETE tables directly
- Can only call stored procedures
- Secrets (password) stored in Azure Key Vault

### Audit Trail
- Every action logged: CreatedBy, CreatedOn, ModifiedBy, ModifiedOn
- Full history in InvoiceHistory
- Error log captures failed attempts + context (user, IP, request)

## Performance Optimization

### Indexing
- `IX_Invoice_Status`: for filtering Draft → In Review → Approved
- `IX_Invoice_CreatedOn`: for sorting recent invoices
- `IX_InvoiceHistory_InvoiceId`: for audit trail queries
- `IX_ErrorLog_CreatedOn`: for recent error queries

### Query Optimization
- Soft delete via `IsDeleted` filter avoids full table rewrites
- Pagination on API layer (not in stored procedures yet)
- No polling: events trigger actions immediately (Azure Functions)

### Free Tier Constraints
- Azure SQL Database free tier: 5 DTU-seconds/month soft limit
- Minimize table scans: use indexes
- Batch operations when possible (e.g., bulkupload via SalesOrder)
- Run ErrorLog purge nightly (GitHub Actions free tier)

## Disaster Recovery

### Backups (Automatic)
- Azure SQL Database: automatic daily backups (35 days retention)
- Geo-redundant backup (LRS or GRS)
- Restore via Azure Portal (free within free tier)

### Connection Strings
- Production: `shriyamining-sql` / `shriyaminingdb`
- Test: `shriyamining-sql` / `shriyaminingdbtest` (separate database)
- Never: same connection string for testing production data!

## Next Steps

1. **CI/CD Pipeline** (Step 8): 
   - GitHub Actions runs migrations on test DB before each deployment
   - Runs database tests in SQL Server container

2. **Azure Functions API** (Step 6):
   - Implements HTTP endpoints calling these stored procedures
   - Handles JWT auth, request validation, response mapping

3. **Frontend** (Step 7):
   - Vue.js app calls API endpoints
   - Handles 409 conflicts, retry logic, concurrent edit UI

4. **Phase 2: Fulfillment** (Step 9+):
   - OrderFulfillment, FulfillmentLine tables
   - Delivery tracking, weight validation
   - Email notification triggers

## References

- `/docs/architecture.md`: Master/history pattern, audit strategy
- `/docs/decisions.md`: Why auto-numbering, first-write-wins, temporal tables
- `/docs/error-codes.md`: Full error catalogue (auto-generated from V002)
- `/tests/test-cases/TEST-CATALOGUE.md`: All 77 baseline tests
- `/tests/db/database.test.js`: Mock tests (local development)
