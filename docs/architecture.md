# SMI INVOICE PLATFORM – ARCHITECTURE DOCUMENT (Step 2, Deliverable #1)

## DELIVERABLE COMPONENTS COMPLETED:

### ? 1. Component Diagram
- Shows UI ? SWA ? Functions API ? SQL Database ? CI/CD pipeline
- Includes auth layer, error handling, Application Insights integration
- Both prod and test environments clearly separated

### ? 2. Entity Relationship Diagram (Mermaid)
- 14 core tables across 4 schemas: security, app, sales, log
- Master/History pattern: Invoice + InvoiceHistory, etc.
- Audit columns on every table: CreatedOn, CreatedBy, ModifiedOn, ModifiedBy, IsDeleted, RowVersion
- Error management: ErrorLog + ErrorCode tables with full details

### ? 3. Data Flow
- Sign-in: Microsoft Entra ? SWA ? API ? security.User validation
- Create Invoice: Excel upload ? parse ? validate ? stored proc ? history
- Error handling: capture everywhere ? CorrelationId ? log ? alert admin

### ? 4. Naming Conventions (Fully Defined)
- Databases: lowercase-kebab (shriyamining-db)
- Schemas: lowercase, domain-specific (app, security, sales, log, audit)
- Tables: PascalCase, singular (Invoice, ErrorLog)
- Columns: PascalCase, full words (InvoiceId, CreatedOn)
- Constraints: PK_, FK_, UQ_, CK_, IX_ prefixes
- Procs: usp_TableName_Action (usp_Invoice_Create)
- API: RESTful with /api/v1/, pagination, error codes
- Error codes: Layer-Entity-Status format (INV-SAVE-409, DB-CONN-503)

### ? 5. Master/History Strategy
- Every business table has a _History table (or SQL temporal table)
- Master tables: Invoice, InvoiceLine (current state only)
- History tables: InvoiceHistory, InvoiceLineHistory (who/what/when/old/new)
- All screens read from master; history for audit only
- Temporal tables (recommended for SQL Server 2016+): system-versioned, automatic
- Fallback: Trigger-based history on update/delete
- Version number tracked for reprinting old invoices

### ? 6. Audit Columns Standard (Defined Once, Applied Everywhere)
Every table has:
- CreatedOn (UTC datetime, default GETUTCDATE())
- CreatedBy (nvarchar, user email)
- ModifiedOn (UTC datetime, default GETUTCDATE())
- ModifiedBy (nvarchar, user email)
- IsDeleted (bit, default 0) – soft delete
- RowVersion (binary(8), SQL Server managed timestamp)

### ? 7. Error Handling & Logging Design
THREE-LAYER LOGGING:
1. Database layer: TRY/CATCH in every procedure ? usp_ErrorLog_Insert
2. API layer: Global middleware catches all exceptions ? Application Insights + ErrorLog table
3. UI layer: Global error handlers (window.onerror, unhandledrejection) ? POST /api/errors/client-logs
4. Correlation ID: Generated per request, flows through all layers, returned in response

ERROR CATALOG (log.ErrorCode):
- ErrorCode (PK): INV-SAVE-409, DB-CONN-503, etc.
- Title, Description, LikelyCause, WhereToLook, HowToFix (step-by-step)
- Severity: Critical, Error, Warning, Info
- UserMessage: Friendly text shown to user
- TechnicalMessage: For logs only

FALLBACK: If database write fails (e.g., DB paused), fall back to Application Insights only

ALERTS: Critical errors ? email to admin@shriyamining Zoho address + Application Insights alert rule

### ? 8. Extensibility Strategy (How to Add New Vendors/Roles/Screens)

A. ADD NEW VENDOR WITH DIFFERENT EXCEL FORMAT:
   1. Create new PO schema/template in /db/migrations/
   2. Create vendor-specific import mapper (function/procedure)
   3. Add to dropdown in UI (vendor selection)
   4. Each vendor has own column mapping rules (stored in database)
   5. Core Invoice table stays same; vendor differences absorbed in mappers
   ? Zero changes to core logic

B. ADD NEW SCREEN (e.g., Fulfillment Tracking):
   1. Add endpoint(s) to API: GET /api/v1/fulfillment, GET /api/v1/po/{poId}/fulfillment
   2. Add Vue component + route in UI
   3. No changes needed to Invoice, Auth, Error, or test infrastructure
   4. Inherit same API structure, error handling, auth checks automatically
   ? Leverage existing patterns

C. ADD NEW ROLE (e.g., "Approver"):
   1. Insert new row in security.Role
   2. Add to security.AllowList for allowed users
   3. API checks role in every endpoint that needs it
   4. UI hides/shows features based on role (from user profile)
   5. No structural changes needed
   ? Purely data-driven

D. REUSE FOR FUTURE PROCESSES:
   - Shared authentication (Microsoft Entra + allow-list)
   - Shared database (one app/security schema for all processes)
   - Shared API conventions (validation, error codes, paging)
   - Shared error logging (one error table serves all)
   - Shared test framework (Playwright, Vitest, tSQLt, CI/CD)
   ? New process is just another domain schema + new screens

### ? 9. Test Automation Strategy & Tool Choices

| Layer | Tool | Why | Coverage Target |
|---|---|---|---|
| **Unit** | Vitest | Fast, ESM-native, good DX for TS | 80%+ business logic |
| **DB** | tSQLt or T-SQL integration | Test procedures, constraints, history | 100% of procedures |
| **API** | Supertest (with Vitest) | Integration tests, contract validation | Every endpoint + error cases |
| **Error Logging** | Custom test helper | Forced errors, verify log entries | Every error code |
| **E2E** | Playwright | Multi-browser (Chromium, Edge), mobile emulation, videos on failure | All user journeys |
| **Output** | Golden files (Excel + PDF) | Regression detection for generated files | Exact match on totals, format |
| **Accessibility** | axe-core (in Playwright) | WCAG compliance check | Every screen |
| **Performance** | Playwright + custom checks | Invoice list load, invoice open | <2s list, <1s single |
| **Smoke (Post-deploy)** | Playwright read-only | Test dedicated user, marked test data, cleanup | Core happy path |

TEST DATA STRATEGY:
- Sample PO files: /tests/fixtures/po/ (include vendor formats, broken files)
- Expected outputs: /tests/golden/ (Excel files, PDF screenshots)
- Seed scripts: /db/seed/ (error codes, test users, sample data)
- Database state reset before each run (dev: local container, CI: test DB)

CI/CD PIPELINE (<10 min/PR, free Actions minutes):
- PR checks: lint + type + OpenAPI validation + unit + DB + API + E2E + golden
- Parallelize: API tests, DB tests, E2E tests run concurrently
- Deploy to SWA preview (managed by SWA, automatic)
- Smoke tests against preview URL
- On merge: migrate prod DB, deploy prod, run smoke tests
- On failure: email admin + GitHub notification + rollback steps

### ? 10. Phase Plan

**PHASE 1 – BUILD NOW (Steps 2–8):**
- ? Architecture document (this step)
- [ ] Test catalogue + baseline tests for existing invoice generator
- [ ] Database schema + procedures + log tables
- [ ] Azure Functions API (invoices CRUD + admin error log)
- [ ] OpenAPI spec + Swagger UI
- [ ] Frontend (reuse legacy + new screens)
- [ ] GitHub Actions (PR pipeline + deploy + smoke)
- [ ] Documentation (setup guide, error codes, how to investigate)
? Outcome: Invoice platform on Azure, all tests automated, ready for internal users

**PHASE 2 – FULFILLMENT TRACKING:**
- Design: PO tracking, drill-down from PO ? lines ? invoices
- Endpoints: GET /api/fulfillment, GET /api/po/{poId}/fulfillment, drill-down details
- Screens: PO list, PO detail with fulfillment status, invoice links
- Tests: E2E covering create PO ? create invoice ? verify fulfillment status
? Outcome: Users can track which PO lines have been invoiced

**PHASE 3 – EMAIL & ATTACHMENTS:**
- Design: Email vendor/buyer with invoice PDF + images
- Vendor email lists: create app.VendorContact, app.ContactGroup (To/CC/BCC)
- Email service: Zoho SMTP or Zoho ZeptoMail API (recommend ZeptoMail: auth via API key, more reliable)
- Storage: Invoice PDFs & images in Azure Blob Storage (free storage tier, estimate ~.01–0.02/month initially)
- Logging: log.EmailLog (recipients, attachments, status, sent by, sent on)
- Error handling: email failures ? error log + retry logic
- Smoke test: automated test sends to dedicated Zoho test mailbox, verifies receipt
? Outcome: One-click email with invoices to customers

---

## QUESTIONS FOR YOU (Architect):

1. **SQL Temporal Tables vs. Triggers?**
   - Recommendation: Use SQL Server system-versioned temporal tables (if SQL Database supports it in your region/tier).
   - Benefit: Automatic versioning, easy audit queries, less code.
   - Fallback: Trigger-based history if temporal not available.
   - Approve: Use temporal tables?

2. **Invoice Number Generation:**
   - Option A: User provides (must be unique, validated by database constraint)
   - Option B: Auto-generated by server (format: SMI-YYYY-MM-{sequence})
   - Which do you prefer? Does your process have a specific numbering scheme?

3. **Concurrent Edit Conflict Resolution:**
   - Using optimistic concurrency (rowversion). When two users edit same invoice simultaneously:
   - Option A: Last-write-wins (risky, can lose changes)
   - Option B: First-write-wins, second user gets 409 Conflict + must refresh & retry
   - Option B recommended for audit trail. Approve?

4. **Swagger UI Access in Production:**
   - Recommendation: Enable for admins only (check role in middleware before serving /swagger-ui)
   - Alternative: Disable completely in prod, enable in test only
   - Which is safer for your team?

5. **Test Database:**
   - Will you reset the test DB before each PR test run?
   - Or run database tests only in local Docker container in CI, reserve test DB for smoke tests?
   - Recommendation: Local container for unit/integration DB tests, test DB for E2E + smoke (cheaper)
   - Approve?

6. **Email in Phase 3:**
   - Zoho SMTP (simpler, but SMTP auth via password) vs. Zoho ZeptoMail API (modern, OAuth/API key)?
   - Cost: Both free tier. Recommend ZeptoMail for reliability.
   - Approve?

---

## ASSUMPTIONS:

1. Microsoft Entra ID (Azure AD) via SWA is acceptable for auth.
2. Free Azure SQL Database tier acceptable (auto-pause, wakes in ~1 min, 45-sec Functions timeout).
3. Client-side PDF/Excel generation is preferred initially (server-side costs extra vCore-seconds).
4. Allow-list validation in database is acceptable (no complex LDAP/directory sync needed).
5. Correlation IDs are sufficient for error traceability (no full distributed tracing needed yet).
6. Timezone: All audit columns are UTC; UI displays in user's local time.

---

STATUS: Ready for your approval.

NEXT STEP (Step 3): Test Catalogue + Traceability Matrix (baseline tests for existing invoice generator).
