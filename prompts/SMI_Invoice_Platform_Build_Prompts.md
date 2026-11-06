# SMI Invoice Platform – Step-by-Step Build Prompts

Nov 6, 2026

## How to use this prompt pack

Your requirements document is the single source of truth. This pack breaks it into **ten build steps**, each with a ready-to-paste prompt, so the AI builds one deliverable at a time and you approve each before the next one starts (exactly the "stop after each step" rule in your document).

**Recommended tool:** Claude Code opened inside your GitHub repository (desktop app, web or terminal). It can read the legacy HTML file and the sample Excel, write files, run tests and open pull requests. A plain chat works too, but you would have to copy every file by hand.

**Rules that make this work:**

1. **Put the source files in the repo first** (Step 0): the requirements document, the existing invoice generator and the sample PO Excel. Every prompt points at those paths, so nothing depends on chat memory.
2. **Start every session with Prompt 1 (master context)**, then paste the step prompt. New session per step keeps the AI focused and cheap.
3. **Decisions live in the repo, not the chat.** Step 2 creates `/docs/architecture.md` and `/docs/decisions.md`; every later step is told to read them and follow them.
4. **One step = one branch = one pull request.** Review, merge, then move on.
5. **Each step ends with an "Approve when" checklist.** Do not move on until every box is true. If something is wrong, reply in the same session with what to change.

| Step | Prompt | Deliverable (from your doc) | You approve |
|---|---|---|---|
| 0 | Manual setup | Accounts, repo, free-tier guardrails | Checklist done |
| 1 | Master context | Pasted at the top of every session | — |
| 2 | Architecture | Deliverable 1 | Architecture doc + answers to questions |
| 3 | Test catalogue | Deliverable 2 | Catalogue + traceability matrix |
| 4 | Baseline tests | Deliverable 3 | Tests green on the untouched legacy tool |
| 5 | Database | Deliverable 4 | Migrations + DB tests green |
| 6 | API | Deliverable 5 | API + OpenAPI + Swagger + tests green |
| 7 | Frontend | Deliverable 6 | All screens + E2E + golden tests green |
| 8 | CI/CD | Deliverable 7 | PR pipeline < 10 min, deploy + smoke working |
| 9 | Docs + go-live | Deliverable 8 | Setup guide followed end to end |
| 10+ | Phase 2 / 3 / follow-ups | Fulfillment, email, new vendors | Per prompt |

## Step 0 – One-time setup and free-tier guardrails (you do this, ~1 hour)

Do these by hand before any prompt. They cost nothing and prevent surprise bills.

**GitHub**

- [ ] Create the repo (e.g. `shriya-invoice-platform`). **Public repos get unlimited free Actions minutes; private repos get 2,000 min/month on the Free plan.** Invoice code is business data, so private is safer — the pipeline in Step 8 is designed to fit inside 2,000 minutes.
- [ ] Commit these three files on `main`:
  - `/docs/requirements/SMI_Invoice_Platform_Prompt.md` (your requirements document)
  - `/legacy/` → the existing single-page invoice generator, untouched
  - `/tests/fixtures/po/sample-po.xlsx` → the sample PO Excel (remove or mask anything confidential)
- [ ] Turn on branch protection for `main` later, in Step 8 (the AI will give you the exact settings).

**Azure (all free)**

- [ ] Create a **Budget** on the subscription: $1/month, email alert at 50% and 100% to your Zoho address. This is your safety net once you move to Pay-As-You-Go.
- [ ] SQL: you already have `shriyamining-sql` / `shriyamining-db`. Create a **second free database** on the same server, `shriyamining-db-test`. Both stay on the free offer with "auto-pause when limit reached" = on.
- [ ] Create **two** Static Web Apps on the **Free** plan, both linked to the same repo: `swa-smi-invoice-prod` and `swa-smi-invoice-test`. Reason: a separate test app guarantees that its settings (connection string) point only at the test database, so tests can never touch production. Preview environments of the prod app will be used only for UI review, not for database tests.
- [ ] Create one **Application Insights** resource (workspace-based) and set the Log Analytics **daily cap** to a small value (e.g. 0.1 GB/day) so it stays inside the free monthly allowance.

**Accounts for testing and email**

- [ ] A dedicated test Microsoft account, e.g. `invoice-test@<your Zoho domain>`, used only by automated smoke tests.
- [ ] A dedicated Zoho test mailbox for email smoke tests (Phase 3).
- [ ] Your admin Zoho address for alerts.

**Keep handy (do not paste secrets into prompts):** server name, database names, SWA names, App Insights connection string location. Secrets go into GitHub Secrets and SWA app settings only — the AI will tell you the exact names in Step 8.

## Prompt 1 – Master context (paste at the top of EVERY session)

```text
You are working in my GitHub repository for the Shriya Mining Industries (SMI) Invoice Platform.

SOURCE OF TRUTH
- Requirements: /docs/requirements/SMI_Invoice_Platform_Prompt.md  (read it fully before doing anything)
- Existing tool (must keep working exactly as today): /legacy/
- Sample PO file: /tests/fixtures/po/sample-po.xlsx
- Once they exist, also read and follow: /docs/architecture.md, /docs/decisions.md,
  /docs/standards/naming.md, /tests/test-cases/, /docs/error-codes.md
  If anything I ask conflicts with these files, stop and tell me instead of guessing.

HOW TO WORK
- Act as the senior architect / full-stack / test-automation lead described in the requirements.
- Do ONLY the step I give you below. When it is done, STOP, summarise what changed, list open
  questions, and wait for my approval.
- Work on a new git branch named step-<n>-<short-name>; commit in small logical commits; open a PR
  at the end of the step.
- Every change must keep all existing tests green. Never delete or weaken a test to make it pass;
  if a test is wrong, explain why and ask me.
- Record every important decision (what, why, alternatives, how to reverse it) in /docs/decisions.md.

FREE-TIER FIRST (hard rule)
- Target $0/month. Use only: Azure SQL Database free offer (prod + test DB), Azure Static Web Apps
  Free (managed Functions), Application Insights within the free allowance, GitHub Free + Actions.
- Before adding ANY service, package or setting that could cost money, stop and show me:
  what it is, why it is needed, the free alternative, and the estimated monthly cost.
- Design so that moving to SWA Standard + Flex Consumption Function App (Central India) or a paid
  SQL tier is a configuration change only.
- Minimise SQL vCore-seconds: no polling, no chatty queries, warm-up only when needed; run most
  database tests in a local SQL Server container in CI instead of the Azure test database.

SECURITY
- Never put secrets in code, logs, prompts or commits. Use environment variables / GitHub Secrets.
- Parameterised SQL only. Authorization check on every API call.

THE STEP FOR THIS SESSION:
```

## Prompt 2 – Architecture document (Deliverable 1)

```text
STEP 2 – ARCHITECTURE DOCUMENT ONLY. Write no application code in this step.

1. Read the requirements file, every file in /legacy/ and the sample PO Excel. Before designing,
   write /docs/legacy-feature-inventory.md: every feature, input, output, calculation, formatting
   rule and edge case of the existing tool (e.g. column mapping, record selection, header and line
   editing, totals, rounding, amount in words, crate numbers, Excel layout/merged cells/formulas,
   print/PDF layout). Number each feature LEG-001, LEG-002 ...

2. Create /docs/architecture.md containing, in this order:
   a. Executive summary (one page, plain English).
   b. Technology choices with justification and rejected alternatives. Evaluate at least:
      Node.js 20+/TypeScript + Azure Functions v4 vs .NET 8 isolated for SWA managed functions;
      frontend framework (keep vanilla + modules vs a framework such as React/Vite) given that the
      legacy behaviour must stay identical; validation (zod); SQL access (mssql/tedious with
      parameters); Excel (SheetJS vs ExcelJS) and PDF generation (browser print vs a pure-JS PDF
      library that runs inside Functions without a headless browser); test tools (Vitest,
      Playwright, tSQLt or integration tests, axe-core, Mailpit). Prefer what is free, current
      and works inside the SWA Free plan limits (45 s timeout, no managed identity, no persistent
      disk, built-in auth only).
   c. Component diagram and data-flow diagram (Mermaid): browser → SWA auth → managed Functions
      (East Asia) → Azure SQL (Central India) → Application Insights; include the test app,
      the CI SQL Server container, and future Blob Storage + Zoho mail.
   d. ER diagram (Mermaid) for ALL schemas including log, security, master data, purchasing
      (imported PO header/lines), sales/invoicing, fulfillment, notification, audit/history.
      Propose the final schema list and explain each.
   e. Standards: naming (tables, columns, PK_/FK_/UQ_/IX_/CK_/DF_, usp_/fn_/vw_/trg_, API routes,
      error codes, test IDs, files), the standard audit column set, data types (money, quantity,
      dates in UTC, NVARCHAR for Indian-language text). Also write them to
      /docs/standards/naming.md.
   f. Master/history strategy: for each entity say temporal table vs trigger-based history table
      and why; how invoice versions are numbered and reprinted; how screens read only master data.
   g. Security and authorization: SWA built-in Microsoft provider, DB allow-list + roles
      (admin, invoice creator, viewer, approver), how every API call checks permission, OWASP Top 10
      table, least-privilege SQL user.
   h. Error handling and logging design covering every point in the ERROR HANDLING & LOGGING
      section: tables, error-code catalogue, correlation ID flow, middleware, client error
      endpoint, App Insights fallback, retention, and a $0 alert design (explain the cost of
      Azure Monitor log alert rules and offer a free alternative, e.g. a scheduled GitHub Action
      that checks the error log and emails me).
   i. Free-tier handling: database auto-pause wake-up and retry, keeping vCore-seconds low,
      45-second timeout (large imports in chunks), App Insights cap, GitHub minutes budget.
   j. Environments: local (SWA CLI + SQL container), CI, test SWA app + test DB, production.
      Explain exactly how tests can never touch production data.
   k. Extensibility: step-by-step how to add (1) a vendor with a different Excel format, fields,
      layout or rules (import mapping templates, invoice templates, extension fields), (2) a new
      screen/business process, (3) a new role/permission — and how the tests extend for each.
   l. Test automation strategy: layers, tools, how automated tests sign in (compare SWA CLI
      emulated auth, a non-production-only test auth mode that cannot be enabled in prod, and a
      stored auth state for a test account; recommend the safest), coverage targets, golden
      files, pipeline time budget.
   m. Backup/restore, monitoring and alerts (including the SQL free-allowance alert).
   n. Upgrade path: what config changes when moving to SWA Standard + Flex Consumption or paid SQL.
   o. Phase plan (Phase 1/2/3) with the order of work.
   p. Cost table: every component, free limit, expected usage for 20 users/500 requests a day,
      monthly cost now, and cost if upgraded.
   q. Assumptions, risks, and at most 10 questions for me.

3. Create /docs/decisions.md with one entry per major decision.
4. STOP. Show me the summary, the cost table and your questions.
```

**Approve when:** every legacy feature you know of is in the inventory; the cost table shows $0 for Phase 1; you understand (and have answered) the questions; the sign-in approach for tests is clear.

## Prompt 3 – Test case catalogue and traceability matrix (Deliverable 2)

```text
STEP 3 – TEST CASE CATALOGUE + TRACEABILITY MATRIX. No application code, no test code yet.

1. Create /docs/requirements/requirements-register.md: split the requirements file into atomic,
   numbered requirements (e.g. REQ-AUTH-001, REQ-INV-CRT-001, REQ-LOG-001, REQ-NFR-001), plus every
   LEG-xxx legacy feature from /docs/legacy-feature-inventory.md.

2. Create the catalogue under /tests/test-cases/ as one machine-readable YAML file per feature area
   (legacy, auth, users-roles, invoice-crud, search, versions, import, output-excel, output-pdf,
   error-logging, openapi, fulfillment, email, accessibility, performance, smoke).
   Fields per test: id, feature, title, priority (P1/P2/P3), layer (unit/database/api/e2e/output/
   logging/smoke), preconditions, testData, steps, expected, requirementIds, automatedFile,
   automatedTestName, status (planned/automated).

3. Order: LEGACY FEATURES FIRST (characterisation tests), then new features. Include positive,
   negative, boundary and permission cases — at minimum every example listed in the requirements
   (invalid/empty Excel, wrong columns, duplicate invoice number, concurrent edit 409, user not on
   allow-list, non-admin delete, DB waking from pause, very large invoice, special characters and
   Indian-language text, rounding and amount in words).

4. Write a small script (scripts/generate-traceability.ts) that reads the register and the YAML
   files and generates /tests/test-cases/traceability-matrix.md, and exits with an error if any
   requirement has no test, a test points to an unknown requirement, or (later) an "automated"
   test's file/name does not exist. Add it as `npm run test:catalogue`.

5. Flag anything you think cannot be automated in /tests/test-cases/manual-exceptions.md with the
   reason and an automated alternative (the default answer is: automate it).

6. STOP. Show counts per area and priority, and the exceptions list.
```

**Approve when:** every requirement row has at least one test; the legacy section reads like a description of how you use the tool today; the exceptions list is empty or you agree with each item.

## Prompt 4 – Baseline tests for the existing tool (Deliverable 3)

```text
STEP 4 – CHARACTERISATION TESTS FOR /legacy/. DO NOT CHANGE ANY FILE IN /legacy/.

1. Set up the root Node.js/TypeScript workspace (npm workspaces), Playwright and Vitest, with
   `npm test`, `npm run test:e2e`, `npm run test:legacy`. Serve /legacy/ with a static server.

2. Automate every LEG-xxx test from the catalogue with Playwright (Chromium + Edge + one tablet
   and one mobile emulation): upload PO Excel/CSV → select records → edit header and lines →
   download Excel → print/PDF view.

3. Golden-file tests:
   - Excel: parse the downloaded file and compare cell values, formulas, merged cells, number
     formats, fonts/borders that matter, sheet names. Store expected files in /tests/golden/excel/.
   - Print/PDF: capture the print-media HTML; compare extracted text (totals, amount in words,
     crate numbers, headers, vendor details) and a visual screenshot with a small tolerance.
     Store in /tests/golden/print/. Make timestamps/dates deterministic (fixed clock).

4. Add fixtures in /tests/fixtures/po/: the sample, an empty file, wrong columns, extra columns,
   a large file (e.g. 2,000 lines), special characters + Hindi/Telugu/Tamil text, rounding edge
   cases. Generate them with a script so they can be rebuilt; never use real customer data.

5. Document in /docs/testing/golden-files.md how to update golden files intentionally
   (`npm run golden:update`, review the diff in the PR, reviewer approval).

6. Mark these catalogue entries status: automated and run `npm run test:catalogue`.
7. Run everything. ALL tests must pass against the untouched legacy tool. STOP and show the report.
```

**Approve when:** the HTML report is all green; you open a golden Excel and it matches what you send to buyers today; `git diff main -- legacy/` is empty.

## Prompt 5 – Database migrations and database tests (Deliverable 4)

```text
STEP 5 – DATABASE. Follow /docs/architecture.md and /docs/standards/naming.md exactly.

1. Create /database/migrations/ with versioned, idempotent scripts (V001__schemas.sql, ...) and
   repeatable scripts for views/functions/procedures (R__*.sql). Pick a free migration runner
   (e.g. a small Node runner with a migration history table, or DbUp/Flyway Community) and justify.
   Collation: SQL_Latin1_General_CP1_CI_AS; NVARCHAR for text.

2. Create: schemas; all Phase 1 tables (security users/roles/permissions, master data such as
   vendors/buyers and import/invoice templates, purchasing PO header/lines + import batches,
   invoicing header/lines/versions, log tables) and the Phase 2/3 tables from the ER diagram
   (fulfillment views, email recipients, email log, attachments) so later phases need no redesign.
   Standard audit columns + RowVersion on every table. All PK/FK/UQ/CK/DF/IX constraints, named
   by the standard. History: temporal tables or trigger history exactly as decided.

3. Stored procedures for every create/update/soft-delete and complex query (search with
   server-side paging/filters, invoice summary list, invoice detail, version list, reprint a
   version). Every procedure: SET NOCOUNT ON, SET XACT_ABORT ON, TRY/CATCH, rowversion check
   returning a clear 409-type error, CATCH calls log.usp_ErrorLog_Insert with ERROR_NUMBER,
   ERROR_PROCEDURE, ERROR_LINE, ERROR_MESSAGE and the correlation ID, then THROW.

4. Views (vw_) and functions (fn_) the screens use, built only on master tables.

5. log.ErrorLog, log.ErrorCode (seeded with EVERY error code the system can raise, in a seed
   script), log.ApplicationEvent, log.usp_ErrorLog_Insert, and a retention procedure
   (90 days Info/Warning, 1 year Error/Critical) plus how it is scheduled for $0 (e.g. the
   nightly GitHub Action calls it).

6. scripts/generate-error-codes-doc.ts → /docs/error-codes.md from the seed; CI fails if stale.

7. Least-privilege login/user for the app: EXECUTE on app procedures + SELECT on views only, no
   table writes. Separate migration user. Scripts must not contain passwords (use variables).

8. Seed data: roles, permissions, first admin (my email as a parameter), a test vendor.
   Test seed: resets the test DB to a known state; must refuse to run if the database name is
   the production one.

9. Database tests: run in CI against a SQL Server container (free, no vCore-seconds). Use tSQLt
   if it works there, otherwise Vitest integration tests. Cover: update writes history, soft
   delete hides from views, audit columns filled, duplicate invoice number rejected, rowversion
   conflict, failing procedure writes a correct error-log row, retention purge, app user cannot
   write tables. Also a compatibility check that the scripts run on Azure SQL Database.

10. Update catalogue status + traceability. Run all tests (legacy tests must still pass). STOP.
```

**Approve when:** migrations run twice in a row without errors (idempotent); DB tests green; `/docs/error-codes.md` exists; you have applied the migrations to the **test** database only, following the instructions given.

## Prompt 6 – Azure Functions API, OpenAPI and Swagger UI (Deliverable 5)

```text
STEP 6 – API in /api (SWA managed Functions). Use the stack chosen in /docs/architecture.md.

1. Layered structure: functions/ (HTTP endpoints only) → validation/ (zod schemas) → services/
   (business rules) → data/ (stored-procedure calls only, parameterised) → shared/ (config,
   errors, logging, auth, correlation). All config from environment variables in one typed
   config module, so switching to a dedicated Function App or paid SQL is config only.

2. Endpoints for Phase 1: health (no DB), me (current user + permissions), users/roles admin,
   PO import (validate, store batch + lines, chunked to stay under 45 s), PO search, invoices
   (create from PO lines or blank, search with paging/filters returning summary only, get by id,
   update with rowversion/If-Match → 409 on conflict, soft delete, versions list, get version,
   export version as Excel/PDF), error log admin (search, detail joined to catalogue, resolve,
   export CSV/JSON), POST /api/client-errors (rate-limited, sanitised), openapi.yaml, docs.

3. Auth: read the SWA x-ms-client-principal header, look the email up in the DB allow-list,
   load roles/permissions, deny if inactive. Permission check on EVERY endpoint via one helper.
   Test auth mode exactly as decided in architecture.md — it must be impossible to enable in
   production (check environment + fail at startup), with a unit test proving it.

4. Global error middleware: catches everything, maps to an error code from log.ErrorCode,
   returns ONE error format { error: { code, message, correlationId, details? } }, logs to the
   DB with source file/function/line resolved via source maps, falls back to Application
   Insights if the DB write fails, never leaks technical details to users, never logs secrets.
   Correlation ID: accept x-correlation-id or generate one, return it in the response header,
   pass it to every stored procedure.

5. DB wake-up retry: detect the transient errors returned while the free DB resumes, retry with
   backoff inside the 45 s budget, return DB-CONN-503 with a friendly "starting up, try again"
   message if still not ready. Reuse one connection pool.

6. OpenAPI 3.1 file at /api/openapi.yaml: every endpoint, schema, example, error response and the
   auth requirement. Generate zod ↔ OpenAPI from one source if practical. Swagger UI page:
   enabled locally and in the test app; in production admin-only (or disabled by a setting) —
   explain how. Document how auth works from Swagger UI. Lint the spec (e.g. Redocly/Spectral)
   and add a CI check that fails if routes in code and the spec differ. Export a Bruno or
   Postman collection from the spec.

7. Structured JSON logging to App Insights with correlationId, errorCode, source location,
   appVersion (release + commit SHA), environment. Respect the daily cap.

8. Tests: Vitest unit tests (≥ 80% coverage on services/validation, enforced); API integration
   tests for every endpoint (success, validation 400, 401, 403, 404, 409, paging, search) against
   the SQL container; contract tests validating every response against openapi.yaml;
   error-logging tests (forced errors in API, DB and integration layers produce correct log rows,
   no secrets, App Insights fallback when the DB is unavailable); simulated DB-paused tests.

9. Update catalogue + traceability + error codes. Run the full suite. STOP.
```

**Approve when:** you can open Swagger UI locally, sign in with the emulator, and "Try it out" on invoice create/search/edit; a forced error shows a reference ID that you can find in `log.ErrorLog`; coverage report ≥ threshold.

## Prompt 7 – Frontend: legacy features rebuilt + new screens (Deliverable 6)

```text
STEP 7 – FRONTEND in /app. Use the framework chosen in /docs/architecture.md.

1. Rebuild (or wrap) every LEG-xxx feature so that the existing Playwright characterisation and
   golden tests pass UNCHANGED against the new app (point them at the new URL; the expected
   results must not change). If any legacy test must change, stop and explain why.

2. New screens (Phase 1), all reading from the API only:
   - Sign-in / not-authorised page (friendly message for users not on the allow-list).
   - Invoice list: summary data, server-side paging, filters, fast for users in India.
   - Create invoice: from a stored PO import (select lines) or blank.
   - Invoice view/edit with optimistic concurrency (clear message + reload option on 409).
   - Version history: list, compare, reprint/download any version as PDF or Excel.
   - PO import screen: upload, validation results per row, import history.
   - Admin: users and roles (add, change role, deactivate).
   - Admin: Error Log (filters date/severity/layer/code/user/status, detail with WHERE TO LOOK
     and HOW TO FIX, mark resolved with notes, download CSV/JSON).
   - Link to Swagger UI for admins.
   Hide buttons the user has no permission for, but rely on the API for real enforcement.

3. Global client error capture: window.onerror, unhandledrejection, failed API calls, Excel
   import and Excel/PDF generation failures → POST /api/client-errors with screen/component,
   source file/line (source maps), correlation ID; rate-limited; never sends file contents.
   Friendly message with reference: "Something went wrong. Reference: 7F3A-21C9".

4. A config module for the API base URL and feature flags (so the same build works for local,
   test and prod). Build output must fit SWA Free size limits.

5. Tests: Playwright E2E for every journey (Chromium, Edge, tablet, mobile), golden output tests
   for new Excel/PDF exports (same as legacy where the layout is the same), axe-core
   accessibility checks on every screen, a performance check (agree targets, e.g. invoice list
   < 2 s and invoice open < 2 s on the test app, warm DB), visual snapshots, UI error-capture
   tests.

6. Update catalogue + traceability. Run the full suite. STOP and give me a short click-through
   guide to review the screens locally.
```

**Approve when:** you click through every screen locally; legacy golden tests still pass with zero changes to expected files; accessibility report has no serious issues.

## Prompt 8 – Repository, GitHub Actions and staticwebapp.config.json (Deliverable 7)

```text
STEP 8 – CI/CD. Budget: PR pipeline under 10 minutes and the whole month inside 2,000 free
GitHub Actions minutes (private repo). Show me the minutes estimate per workflow per month.

1. staticwebapp.config.json: all routes require the authenticated role except the login and
   not-authorised pages and /api/health; Microsoft provider only (block GitHub/other providers);
   401 → login redirect; security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors);
   Swagger route rules per environment. Explain what can and cannot be done on the Free plan.

2. Workflows:
   a. pr.yml (on pull request) — parallel jobs with caching: lint + type check, OpenAPI lint +
      code/spec match, catalogue/traceability check, error-codes.md freshness, unit + coverage,
      DB + API + contract + error-logging tests against a SQL Server service container,
      E2E + output + accessibility against the app served locally with the SWA CLI.
      Then deploy to the TEST SWA app, apply migrations to the TEST DB (with a DB wake-up step),
      reset test data, and run a short E2E smoke on the test URL.
      Publish the HTML report (pass/fail per test ID, coverage, screenshots/videos/traces on
      failure) as an artifact and post a summary comment on the PR.
   b. deploy-prod.yml (on merge to main) — wait for green PR checks, take a backup/restore point
      note (and optional bacpac export), apply migrations to PROD with the migration user,
      deploy the prod SWA app, run post-deploy smoke tests (read-mostly, dedicated test user,
      test data tagged and cleaned up). On failure: email my Zoho address + GitHub notification,
      and roll back the app automatically to the previous build; give manual DB rollback steps.
   c. nightly-regression.yml (scheduled, e.g. 02:00 IST) — full suite against the test app/DB,
      then run the log retention procedure on prod and test, then check prod for new Critical or
      repeated errors and email me (the free alert path).
   d. weekly-backup.yml (optional) — bacpac export of prod to a private artifact or tell me the
      cost of Blob Storage for this.
   Every secret from GitHub Secrets / Environments; production secrets only in a protected
   "production" environment with me as required reviewer.

3. Guard rails: a step that fails if a test job's connection string points at the prod DB;
   concurrency groups so two deploys never run at once; path filters so docs-only PRs skip E2E.

4. Give me /docs/setup/branch-protection.md with the exact settings to click (required checks,
   P1/P2 tests must pass, require PR review, no force-push) and the list of every secret and
   app setting to create, with where to find each value.

5. One command locally: `npm run test:all`, plus `npm run dev` (SWA CLI + SQL container).
6. STOP. Walk me through creating the secrets, then let the first PR run end to end.
```

**Approve when:** a test PR goes green in under ~10 minutes; merging deploys to prod and smoke tests pass; a deliberately broken smoke test sends you an email; the monthly minutes estimate is under 2,000.

## Prompt 9 – Documentation and go-live (Deliverable 8)

```text
STEP 9 – DOCUMENTATION for a non-expert, in /docs. Use screenshots or exact click paths.

1. /docs/setup/azure-and-github.md — from zero: subscription + budget alert, SQL server and both
   free databases (with the free-allowance alert), firewall rules, logins/users, both SWA apps,
   linking GitHub, app settings, Application Insights + daily cap, the free alert workflow, and
   (marked optional with cost) Azure Monitor alert rules.
2. /docs/testing/running-tests.md — run tests locally, read the HTML report, debug a failed
   Playwright trace, update golden files intentionally.
3. /docs/api/using-swagger.md — open Swagger UI locally/test/prod, sign in, Try it out.
4. /docs/support/investigating-errors.md — from the reference the user sees → Error Log screen /
   App Insights query (give ready KQL) → /docs/error-codes.md → the file or procedure to fix
   → add a regression test → mark resolved.
5. /docs/operations/backup-restore.md and /docs/operations/upgrade-path.md (what to change to move
   to SWA Standard + Flex Consumption in Central India, or a paid SQL tier).
6. /docs/user-guide.md — short guide for the 15–20 users in India.
7. A go-live checklist: add real users to the allow-list, import first real PO, compare the first
   invoice with the legacy tool output side by side, keep /legacy/ available for 1 month.
8. Verify every document by following it yourself where possible. STOP.
```

**Approve when:** you (or a colleague) can follow the setup guide without asking questions; the first real invoice matches the legacy output.

## Phase 2 and Phase 3 prompts (after Phase 1 is live)

### Prompt 10 – Phase 2: Fulfillment tracking

```text
STEP 10 – PHASE 2 FULFILLMENT. Tables/views were designed in Step 5; extend, do not redesign.

1. Propose the screens first (wireframe in Markdown/Mermaid) and wait for my OK:
   PO fulfillment list (ordered vs invoiced qty, status Not started / Partially fulfilled /
   Fully fulfilled, filters by vendor/buyer/date/status) → PO detail with line items → the
   invoices that fulfilled each line (link to invoice view/version).
2. After my OK: views/procedures (status calculated from master tables only, correct with soft-
   deleted invoices and edited versions), API endpoints + OpenAPI, screens, tests at every layer
   (including partial, over-invoiced and cancelled cases), catalogue + traceability updates.
3. Run the full suite. STOP.
```

### Prompt 11 – Phase 3: Email with PDF and images

```text
STEP 11 – PHASE 3 EMAIL. Before coding, give me a one-page recommendation with costs for:
(a) Zoho Mail SMTP (app-specific password, sending limits, $0) vs Zoho ZeptoMail API
    (transactional, pay per email credits) — recommend one for ~500 requests/day;
(b) PDF for the attachment: server-side with a pure-JS PDF library inside Functions vs
    client-side generation uploaded to the API — must match the golden print layout;
(c) storage for images/attachments: Azure Blob Storage (cost per GB and per operation, lifecycle
    rule to delete after N days) vs storing in SQL (impact on the 32 GB free limit).
Wait for my approval, then build:
- Per vendor/buyer To/CC/BCC lists, editable by admins (history kept).
- "Preview → Confirm → Send" flow with optional image upload (type/size validation, virus-safe
  handling, size limits under the 45 s timeout).
- Email log (recipients, attachments, status, sent by, sent on); failures to the error log with
  INT-MAIL-xxx codes; secrets only in app settings.
- Tests: Mailpit in CI (recipients by vendor list, subject, body, PDF attachment, images), error
  and retry cases, optional post-deploy smoke to the Zoho test mailbox checked via Zoho Mail API.
- Update OpenAPI, catalogue, traceability, error codes, docs. STOP.
```

## Free-tier cost map

What stays at $0, and what to watch. Prices change — the AI is told to re-check current Azure/Zoho pricing in Step 2 and show you the numbers before anything is added.

| Component | Plan used | Stays free while… | Watch out / upgrade cost |
|---|---|---|---|
| Azure SQL (prod + test) | Free offer, serverless, auto-pause on limit | each DB under 100,000 vCore-seconds and 32 GB per month | If the limit is hit the DB pauses until next month (no bill). Avoid polling; run CI DB tests in a container. Paid tier: check the Azure pricing calculator. |
| Static Web Apps ×2 (prod, test) | Free | within Free plan limits (size, preview environments, managed functions) | SWA Standard is roughly $9 per app per month; adds custom auth, linked Function App. |
| Functions API | SWA managed (East Asia) | inside SWA Free | Flex Consumption in Central India later: has a monthly free grant, small usage likely ~$0. |
| Application Insights | Workspace-based + daily cap | ingestion under the free monthly allowance (5 GB) | Log-search alert rules are billed per rule per month (small, about $1–$2). Free alternative: nightly GitHub Action emails you. |
| GitHub Actions | Free | private repo under 2,000 min/month (public: unlimited) | Extra minutes are billed per minute; path filters + caching keep you inside. |
| Alerts by email | GitHub Action + Zoho SMTP, Azure Budget | always | — |
| Email (Phase 3) | Zoho SMTP or ZeptoMail | Zoho SMTP is $0 within mailbox sending limits | ZeptoMail is pay-per-email credits (low cost per 10,000 emails). |
| Blob Storage (Phase 3, optional backups) | Standard LRS, lifecycle delete | — | A few GB costs cents per month; the free account's 12-month offer may cover it at first. |
| Backups | Built-in SQL point-in-time restore + optional bacpac artifact | always | Artifact storage in a private repo counts toward the free 500 MB. |

## Reusable follow-up prompts

Paste Prompt 1 first, then one of these.

**Add a new vendor/buyer format**

```text
Add vendor/buyer <NAME>. Their PO file is /tests/fixtures/po/<name>/sample.xlsx and their
invoice layout is <describe or attach>. Follow the "add a vendor" procedure in
/docs/architecture.md: import mapping template, invoice template, extension fields, business
rules as configuration where possible. Add fixtures (good + broken), golden outputs, tests at
every layer, catalogue + traceability, error codes, OpenAPI if changed. Existing vendors' golden
tests must pass unchanged. STOP when done.
```

**Fix a bug**

```text
Bug: <what happened>. Error reference shown to the user: <REF>. First write an automated test
that reproduces it and fails. Then find the root cause (show me where), fix it, and make sure
the new test and the full suite pass. Add the test to the catalogue as a regression test.
```

**Add a new screen or business process**

```text
New process: <describe>. Reuse the existing login, roles, database conventions, API layers,
error handling, logging and test framework. Start with: requirements added to the register,
test cases, ER changes and screen wireframes — STOP for my approval before writing code.
```

**Add a role or permission**

```text
Add role <ROLE> with permissions <list>. Seed/migration, API permission checks, UI visibility,
permission tests (allowed and denied for every affected endpoint and screen), docs. STOP.
```

**Health check / review (run monthly)**

```text
Review the repo against /docs/requirements and /docs/architecture.md. Report: requirements with
no test, outdated docs, dependency updates and security advisories, OWASP gaps, slow tests,
GitHub minutes and SQL vCore-seconds used this month vs free limits, anything that may start
costing money. Propose fixes as a prioritised list; change nothing until I approve.
```

**Resume after a break**

```text
Read /docs/decisions.md, the latest PRs and the test report. Tell me which step we are on, what
is done, what is open, and the next action. Do not change anything yet.
```
