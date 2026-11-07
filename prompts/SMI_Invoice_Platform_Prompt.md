# ROLE
Act as a senior IT solution architect, full-stack engineer and test-automation lead with 15+ years of
experience designing production-grade business applications on Microsoft Azure and SQL Server.
Think in terms of long-term maintainability, security, cost control, supportability, test automation and
future expansion. Use the latest stable, well-supported frameworks and tools. Before writing any code,
explain your design decisions and the trade-offs you considered.

# BUSINESS CONTEXT
- Company: Shriya Mining Industries (natural stone exporter). Daily operations are done in India;
  development, design and maintenance are done from Chicago/Austin, USA.
- Users: 15–20 internal users, up to ~500 requests per day. Usage may be daily, weekly or monthly.
- Today invoices are created from Purchase Order (PO) / pending-order data that comes in Excel files.

# WHAT I ALREADY HAVE (ATTACHED)
- A working single-page invoice generator (HTML + JavaScript; attached) that is published from my GitHub repo.
  It reads the PO Excel/CSV file, lets the user select records, edit the invoice header and lines,
  and produces the invoice as Excel and as PDF (through the browser's print dialog).
- A sample PO Excel file (attached).
- RULE: All existing functionality must keep working exactly as it does today. You may rebuild it with a
  better structure or framework, but first list every existing feature in the attached file and cover
  each one with automated tests BEFORE changing anything.

# MY SETUP AND CONSTRAINTS
- Microsoft Azure free account (to be upgraded to Pay-As-You-Go, with the goal of staying at $0 within free limits).
- Database: Azure SQL Database FREE OFFER, region Central India (General Purpose serverless, 32 GB,
  100,000 vCore-seconds/month, auto-pauses after ~15 minutes idle and takes up to ~1 minute to resume,
  "auto-pause when limit reached" = on). Server: shriyamining-sql, database: shriyaminingdb,
  collation SQL_Latin1_General_CP1_CI_AS. One shared database for all current and future business processes.
  The free offer allows up to 10 databases, so a separate free test database can be used.
- Hosting: Azure Static Web Apps FREE plan, deployed from GitHub via GitHub Actions, with the API as
  SWA managed Azure Functions (API region East Asia, because Central India is not available for managed
  functions). Respect the limits: about 45-second request timeout, no managed identity (use a connection string
  in an environment variable), no persistent local file system, and only built-in authentication providers
  on the free plan.
- Email: my organization uses Zoho Mail for every mailbox. Users sign in with Microsoft accounts registered
  with their Zoho email addresses (SWA built-in Microsoft Entra ID provider). Access is restricted to an
  allow-list of users kept in the database.
- Source control and CI/CD: GitHub repository + GitHub Actions (stay within the free Actions minutes).
- Design the solution so that moving later to SWA Standard + a dedicated Function App (Flex Consumption)
  in Central India, or to a paid SQL tier, needs configuration changes only, not a rewrite.

# TECHNICAL SPECIFICATIONS
1. Full CRUD for invoice data: create, search (with server-side paging and filters), view, edit, and
   soft delete. Use optimistic concurrency (rowversion) so that two users editing the same invoice
   cannot silently overwrite each other.
2. Azure Functions API: use the latest supported stack (recommend and justify, e.g. Node.js 20+ with
   TypeScript and the Azure Functions v4 programming model, or .NET 8 isolated). Give me:
   - A layered structure (endpoints → validation → services → data access).
   - Request validation (e.g. zod or FluentValidation).
   - Consistent error responses (one standard error format with an error code and a correlation ID) and
     structured logging (see ERROR HANDLING & LOGGING).
   - Retry logic for the free-tier database waking up from pause.
   - API documentation and testing with Swagger / OpenAPI:
     - An OpenAPI 3 specification file (e.g. /api/openapi.yaml) kept in the solution and in sync with the
       code: every endpoint, request/response schema, error response, example and auth requirement.
     - A Swagger UI page included in the solution, so that I can explore and test every endpoint with
       "Try it out". Enable it in the test environment and locally; in production, restrict it to admins
       (or disable it) and explain how.
     - Explain how authentication works when testing from Swagger UI.
     - CI validates the specification (lint) and fails if the code and the specification do not match.
     - Optionally export a Postman/Bruno collection generated from the specification.
3. Azure SQL database objects (all scripts versioned, repeatable and idempotent, as a migrations folder):
   - Schemas organized by domain (for example: app/security, master data, sales/invoicing, purchasing,
     fulfillment, notification, log, audit/history). Propose the final list.
   - Tables, primary/foreign keys, unique constraints, check constraints, defaults and indexes.
   - Stored procedures for all create/update/delete operations and for complex queries, each with
     TRY/CATCH error handling that writes to the error log (see ERROR HANDLING & LOGGING).
   - Views and functions used by the screens.
   - Triggers only where they are the right tool. Explain where you chose SQL Server system-versioned
     temporal tables versus trigger-based history tables, and why.
   - A least-privilege SQL user for the application (execute on procedures only; no direct table writes).
4. MASTER and HISTORY pattern:
   - Every business entity has a master table that holds only the current state.
   - Every change is captured in a matching history table (who, what, when, old and new values).
   - ALL SCREENS READ ONLY FROM MASTER tables or views built on master tables. History is used only for
     audit, version history and reprinting an older version of an invoice.
5. Audit columns on EVERY table, for example: CreatedOn (UTC), CreatedBy, ModifiedOn (UTC), ModifiedBy,
   IsActive/IsDeleted, RowVersion. Define them once as a standard and apply them consistently.
6. Production-grade naming conventions. Document them and follow them everywhere: tables, columns,
   PK_/FK_/UQ_/IX_/CK_/DF_ constraints, procedures (e.g. usp_), functions (fn_), views (vw_), triggers (trg_),
   API routes, error codes, code and test IDs. No abbreviations unless documented.

# ERROR HANDLING & LOGGING (mandatory)
Goal: every error is recorded in one place with enough detail to tell me WHAT went wrong, WHERE it happened
(layer, file, function/procedure, line), WHO was affected, and HOW TO FIX IT, while users see a simple,
friendly message.

1. Error log tables (in a dedicated `log` schema, following the same naming and audit standards):
   - An error log table, e.g. log.ErrorLog, with at least:
     ErrorLogId, CorrelationId, OccurredOn (UTC), Environment (Prod/Test/Local), AppVersion (release + Git
     commit SHA), Severity (Critical/Error/Warning/Info), Layer (UI / API / Database / Integration such as
     email or Excel import), ErrorCode, UserMessage (friendly), TechnicalMessage, ExceptionType, StackTrace,
     SourceFile, SourceFunctionOrProcedure, SourceLineNumber, HttpMethod, Route, HttpStatusCode, UserEmail,
     RelatedEntity (e.g. Invoice) and RelatedEntityId, RequestDetails (sanitized summary),
     ResolutionStatus (New / Investigating / Resolved / Ignored), ResolvedBy, ResolvedOn, ResolutionNotes,
     plus the standard audit columns.
   - An error code catalogue table, e.g. log.ErrorCode, with:
     ErrorCode (e.g. INV-SAVE-409, DB-CONN-503, XLS-IMP-400), Title, Description, LikelyCause, WhereToLook
     (file / module / procedure / configuration setting), HowToFix (step-by-step), Severity, UserMessage,
     plus audit columns. Seed it with every error the system can raise.
   - A stored procedure to insert error log rows (e.g. log.usp_ErrorLog_Insert) that every other procedure
     calls from its CATCH block, passing ERROR_NUMBER(), ERROR_PROCEDURE(), ERROR_LINE(), ERROR_MESSAGE()
     and the correlation ID, and then re-throws.
   - Optionally a lightweight application event log (e.g. log.ApplicationEvent) for important non-error
     events (sign-in, invoice emailed, import completed). Keep the volume within free-tier limits.

2. Capture errors in every layer:
   - API: a global error-handling middleware that catches every unhandled exception, maps it to an error
     code, logs it (with the source file, function and line taken from the stack trace, using source maps
     for TypeScript) and returns the standard error response. No unhandled exception may reach the user.
   - Database: TRY/CATCH in every procedure, as above.
   - Frontend/UI: global handlers (window error, unhandled promise rejection, failed API calls, Excel import
     and Excel/PDF generation failures) that send errors to an API endpoint (e.g. POST /api/client-errors),
     rate-limited, with the screen/component name and source file and line (using source maps).
   - Integrations: email sending, file upload, Excel parsing and any future vendor integrations.

3. Correlation ID: generate one per request (or accept one from the UI), pass it through UI → API →
   database, return it in a response header, and show it to the user in error messages
   ("Something went wrong. Reference: 7F3A-21C9"), so that support can find the exact log entry.

4. Log files:
   - Send structured (JSON) logs to Azure Application Insights, connected to the Static Web App, within its
     free monthly allowance. Include the correlation ID, error code, source location and app version.
   - Because the Functions file system is not persistent, do not rely on local log files. Instead provide:
     - An admin "Error Log" screen, reading from the master log tables, with filters (date range, severity,
       layer, error code, user, status), a detail view showing WHERE to look and HOW TO FIX (joined from the
       error code catalogue), the ability to mark an error resolved with notes, and a "Download log file"
       button that exports the filtered entries as CSV/JSON.
     - Optional: an automatic daily export of the error log to a file in Azure Blob Storage (flag the cost).
   - Generate a developer reference file in the repo, /docs/error-codes.md, from the error code catalogue:
     each code with its meaning, likely cause, the file/module/procedure to look in, and how to fix it.
     Keep it in sync automatically (e.g. generated during the build).

5. Rules:
   - Users see only friendly messages; technical details appear only in the logs and the admin screen.
   - Never log secrets, passwords, connection strings, access tokens or full file contents.
     Sanitize request details.
   - Logging must never break the main operation. If writing to the database log fails (e.g. the database
     is paused), fall back to Application Insights.
   - Retention: automatically purge or archive old log rows (propose a period, e.g. 90 days for Info/Warning,
     1 year for Error/Critical), to stay within storage limits.
   - Alerts: Critical errors and repeated errors trigger an email to the admin's Zoho address (and an
     Application Insights alert rule).

# EXTENSIBILITY REQUIREMENTS (very important)
The design must allow these changes without restructuring:
- Adding a new vendor/buyer that has a different Excel format, different fields, different invoice layout
  or different business rules (for example: per-vendor import mapping templates, per-vendor invoice
  templates, and configurable or extension fields).
- Adding new screens and new business processes that reuse the same login, users and roles, database,
  API conventions, error handling and logging, and test framework.
- Adding roles and permissions (for example admin, invoice creator, viewer, approver).
Explain exactly how each of these would be done in your design, and how the automated tests extend with it.

# FUNCTIONAL REQUIREMENTS
Phase 1 (build now):
- Sign-in: only signed-in, allow-listed users can open the web URL or call the API. Include user and role
  management tables and an admin way to add or deactivate users.
- Invoice management screen(s): create an invoice (from a PO Excel import, as the tool does today, or a
  blank invoice), search, view, edit, soft delete, view version history, and reprint/download any version
  as PDF or Excel.
- Store the imported PO / pending-order data in the database (not only in the browser), so that invoices
  are linked to PO lines.
- Admin Error Log screen (see ERROR HANDLING & LOGGING) and Swagger UI for API testing.

Phase 2 (design now, build next):
- Fulfillment tracking screen(s): track each PO and each PO line item against invoices, showing ordered vs.
  invoiced quantity and status: Not started / Partially fulfilled / Fully fulfilled. Allow drill-down
  from PO → line items → the invoices that fulfilled them. Propose the best screens for this.

Phase 3 (design now, build later):
- Once I confirm that the invoice preview looks good, send an email with the invoice PDF attached, plus
  optional images (e.g. stone or crate photos) uploaded by the user.
- Email recipient lists maintained per vendor/buyer (To/CC/BCC), editable in the application.
- Send through my Zoho Mail organization (Zoho SMTP or Zoho ZeptoMail API — recommend one).
  Log every email sent (recipients, attachments, status, sent by, sent on). Failures go to the error log.
- Recommend how to generate a real PDF file for the attachment (client-side vs server-side) and where to
  store images and attachments (e.g. Azure Blob Storage), with the cost of each option.

# NON-FUNCTIONAL REQUIREMENTS
- Fast for users in India. The invoice list loads summary data only; full invoice data loads on demand.
- Stay within free tiers. Clearly flag anything that would cost money and give the estimated monthly cost.
- Security: parameterized SQL only, secrets only in environment variables or GitHub secrets, input
  validation, authorization checks on every API call, and the OWASP Top 10 considered.
- Backup and restore approach, monitoring and alerts (including the SQL free-allowance alert).
- Environments: production + a test environment (SWA preview/staging environment + a separate free test
  database). Tests must never touch production data.

# AUTOMATED TESTING & REGRESSION REQUIREMENTS (mandatory)
Goal: on EVERY deployment, automatically prove that (a) all existing functionality still works, (b) new or
changed functionality works, and (c) nothing has regressed. Nothing reaches production if a required test fails.

1. 100% automation policy:
   - Every test case must be automated and run in the CI/CD pipeline. No manual test steps.
   - If something truly cannot be automated, you must list it separately with the reason and an automated
     alternative, and get my approval. The default answer is "automate it".

2. Test case catalogue (versioned in the repo under /tests/test-cases, generated from or kept in sync with
   the automated tests):
   - Start with a complete inventory of the EXISTING features found in the attached invoice generator, and
     write automated baseline ("characterization") tests for each one BEFORE changing anything.
   - Then add automated tests for every new feature (sign-in, invoice CRUD, search, versions, fulfillment,
     email, user management, error logging, Swagger/API documentation, etc.).
   - Format for each test case: Test ID (e.g. INV-CRT-001), Feature, Title, Priority (P1 critical / P2 / P3),
     Layer (unit / database / API / UI end-to-end / output / logging / smoke), Preconditions, Test data, Steps,
     Expected result, Linked requirement, Automated test file and test name.
   - Include positive, negative, boundary and permission cases. For example:
     - Invalid or empty Excel file, wrong columns, a duplicate invoice number.
     - Two users editing the same invoice at the same time.
     - A user who is not on the allow-list.
     - A user who is not an admin trying to delete.
     - The database waking from auto-pause (simulated).
     - Very large invoices.
     - Special characters and Indian-language text.
     - Rounding of totals and the amount in words.
   - A requirements traceability matrix: every requirement → its automated test IDs, so that nothing is left
     untested. The pipeline should fail if a requirement has no linked test.

3. Automated test layers (use current, well-supported tools and justify the choices):
   - Unit tests for API business logic and validation (e.g. Vitest for TypeScript, or xUnit for .NET), with a
     code-coverage report and a minimum threshold (propose one, e.g. 80% for business logic).
   - Database tests: stored procedures, constraints, triggers and history/temporal behaviour.
     For example: an update writes a history row, a soft delete hides the record from master views, audit
     columns are filled, duplicate invoice numbers are rejected, and a failing procedure writes a correct
     error log row. Use tSQLt where Azure SQL Database supports it; otherwise use automated integration tests
     against the test database.
   - API integration tests for every endpoint: success, validation errors, 401/403, 404, 409 conflict,
     paging and search, plus contract tests that validate every response against the OpenAPI/Swagger
     specification.
   - Error-logging tests: forced errors in each layer (UI, API, database, integration) must produce a log entry
     with the correct error code, severity, correlation ID, source file/function/line and a friendly user
     message, with no secrets in the log. The fallback to Application Insights must also be tested.
   - End-to-end UI tests with Playwright covering every user journey:
     - The existing flow: upload PO Excel → select records → edit header and lines → download Excel →
       print/PDF.
     - The new flows: create, search, view, edit, version history, reprint an old version, admin error log
       screen (filter, view, resolve, download), and later fulfillment and email.
     - Run on Chromium and Edge, plus mobile/tablet emulation.
   - Output verification ("golden file") tests:
     - For fixed sample inputs, the downloaded Excel file must match the expected cell values, formulas,
       merged cells and formatting (parse and compare the file).
     - The generated invoice PDF/print HTML must match the expected content (totals, amount in words, crate
       numbers, headers, vendor details), using text extraction for the content and visual screenshot
       comparison for the layout.
   - Email tests (automated):
     - In CI, use a local mail-capture server (e.g. Mailpit) to verify recipients by vendor list, subject,
       body, PDF attachment and images.
     - After a production deploy, an optional automated smoke test sends to a dedicated Zoho test mailbox
       and checks delivery through the Zoho Mail API.
   - Accessibility checks (e.g. axe-core in Playwright) and a basic performance check (invoice list and
     invoice open under agreed response times).
   - Post-deployment smoke tests against the live URL: fast, read-mostly, using a dedicated test user, with
     test data clearly marked and automatically cleaned up afterwards.

4. Test data:
   - Sample PO Excel files kept in /tests/fixtures, including one per vendor/buyer format as new vendors are
     added, plus deliberately broken files.
   - Expected golden output files (Excel, PDF text, screenshots) kept in /tests/golden, with a documented,
     reviewed way to update them when a change is intended.
   - Seed scripts that reset the test database to a known state before each test run, run automatically by
     the pipeline.

5. CI/CD pipeline (GitHub Actions), fully automated:
   - On every pull request: lint + type check + OpenAPI validation + unit + database + API/contract +
     error-logging + end-to-end + output tests against the SWA preview environment connected to the test
     database. Database migrations are applied to the test database automatically first. Branch protection
     blocks merging if any P1/P2 test fails.
   - On merge to main: apply database migrations to production (with a backup/rollback plan), deploy, then run
     the smoke tests automatically. If a smoke test fails, alert me (email to my Zoho address and a GitHub
     notification) and give clear rollback steps (automated rollback where possible).
   - A nightly or weekly scheduled run of the full regression suite against the test environment, which also
     keeps the free-tier database from staying paused during test runs.
   - Publish a readable HTML test report (pass/fail per test ID, coverage, screenshots, videos and traces for
     failures) as a GitHub Actions artifact, plus a summary on the pull request.
   - Explain and implement how automated tests sign in, given SWA Microsoft authentication and possible MFA
     (for example: SWA CLI emulated auth locally and in CI, a test-only auth mode that only works in
     non-production and cannot be enabled in production, or a stored authentication state for a dedicated
     test account). Recommend and implement the safest option.
   - Keep the pull-request pipeline under ~10 minutes, within GitHub's free Actions minutes. Use parallel jobs
     and caching.
   - One command to run everything locally (e.g. `npm test` / `npm run test:e2e`), documented.

6. Ongoing rules:
   - Every new feature or change must add or update its automated tests, test-catalogue entries, OpenAPI
     specification and error codes in the same pull request.
   - Every bug fix must add an automated regression test that would have caught the bug.
   - The test catalogue, traceability matrix, Swagger specification and /docs/error-codes.md must always stay
     up to date.

# DELIVERABLES (in this order; stop after step 1 and wait for my approval)
1. Architecture document:
   - Component diagram, data flow, and an ER diagram (Mermaid, including the log schema).
   - Naming, audit and error-code standards.
   - Master/history strategy.
   - Error handling and logging design.
   - Extensibility approach.
   - Test automation strategy and tool choices.
   - Phase plan.
   - Assumptions, and a short list of questions for me.
2. Test case catalogue + traceability matrix (existing features first, then new features), for my review.
3. Automated baseline tests for the EXISTING invoice generator, running and passing before any changes are
   made, plus the golden output files.
4. Database migration scripts: schemas, tables, constraints, indexes, temporal/history tables, triggers,
   functions, views, stored procedures (with TRY/CATCH logging), log tables and the error code catalogue
   seed, other seed data, the least-privilege app user, the log retention job, and automated database tests.
5. Azure Functions API code + OpenAPI specification + Swagger UI + global error middleware and Application
   Insights logging + automated unit, integration, contract and error-logging tests.
6. Frontend: the existing features rebuilt or integrated, plus the new screens (including the admin Error Log
   screen), global client-side error capture, and automated end-to-end, output, accessibility and visual tests.
7. GitHub repository structure, GitHub Actions workflows (PR checks, deploy with migrations, post-deploy smoke
   tests, scheduled regression, test reports, error-codes.md generation), branch protection settings and
   staticwebapp.config.json.
8. Documentation:
   - A step-by-step setup guide for Azure and GitHub (written for a non-expert), including Application
     Insights and the alerts.
   - How to run the tests locally, how to read the test report, and how to update golden files when a
     change is intended.
   - How to use Swagger UI to test the API.
   - How to investigate an error: from the reference shown to the user → the Error Log screen /
     Application Insights → /docs/error-codes.md → the file or procedure to fix.
