# SMI Invoice Platform - Database Layer

Phase 1 database design and implementation.

## Structure

```
database/
├── migrations/           # SQL migration files (Flyway convention)
│   ├── V001__schemas.sql           # Create all schemas and tables
│   ├── V002__seed-error-codes.sql  # Error code catalogue
│   ├── V003__seed-initial-data.sql # Roles, permissions, test data
│   └── R__error-handling.sql       # Repeatable: stored procedures
├── migration-runner.js             # Node.js migration runner (no deps)
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
- `app.InvoiceHistory` records every status change (insert on every UPDATE via trigger)
- Enables audit trail and version recovery without bloating main table

### Concurrency Control: First-Write-Wins
- Every table has `RowVersion ROWVERSION` (auto-managed by SQL Server)
- Stored procedures check rowversion before UPDATE
- If mismatch: return 409 Conflict error (logged to ErrorLog)
- This prevents lost updates in concurrent scenarios

### Error Handling: Three-Layer Design
- **Database Layer** (stored procedures): SET XACT_ABORT ON, TRY/CATCH, log via `log.usp_ErrorLog_Insert`
- **API Layer**: Catches SQL errors, returns HTTP status codes (409, 404, 500)
- **Client Layer**: Displays user-friendly messages from error catalogue

## Migrations

### Versioned Migrations (V###__name.sql)
Run once in order. Idempotent checks prevent re-running.
- `V001__schemas.sql`: Creates __MigrationHistory table, all schemas, tables, and indexes
- `V002__seed-error-codes.sql`: Inserts 18 error codes with user messages and resolution steps
- `V003__seed-initial-data.sql`: Seeds roles, permissions, test vendor/buyer, and preflight check

### Repeatable Migrations (R__name.sql)
Run every time. Idempotent by design (CREATE OR ALTER).
- `R__error-handling.sql`: Stored procedures for error logging, invoice creation/update, version history queries

All migrations track completion in `__MigrationHistory` table.

## Running Migrations

### Local Development (requires SQL Server or Azure SQL)
```bash
# Set connection string
export DB_CONNECTION_STRING="Server=tcp:shriyamining-sql.database.windows.net;Initial Catalog=shriyamining-db-test;..."
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
- Production: `shriyamining-sql` / `shriyamining-db`
- Test: `shriyamining-sql` / `shriyamining-db-test` (separate database)
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
