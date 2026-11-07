# SMI Invoice Platform � Architecture Decisions Log

**Date:** November 6, 2026  
**Decision Set:** Phase 1 Architectural Choices  
**Status:** ✅ APPROVED (November 6, 2026)

---

## APPROVED DECISIONS

### 1. Frontend Framework: Vue 3 + TypeScript
**Decision:** Use Vue 3 (Composition API) with TypeScript, not a full meta-framework.
**Why:**
- Lightweight, no build complexity (ship as compiled .js in Static Web App)
- Excellent TypeScript support (industry standard)
- Easy testing (unit + E2E via Playwright)
- No lock-in; can migrate to any backend later
- Integrates well with client-side Excel/PDF libraries (SheetJS, jsPDF)

**Alternatives considered:**
- React: Larger bundle, more opinions
- Angular: Over-engineered for this scope
- Svelte: Smaller community, less support

**Reversibility:** High. Core logic in services layer, not tightly coupled to Vue.

---

### 2. API: Azure Functions (Node.js 20 + TypeScript v4)
**Decision:** Managed Azure Functions (not App Service or Flex), v4 programming model.
**Why:**
- Serverless ?  cost on free tier (included in SWA)
- Node.js 20 is LTS and modern (ES2021+)
- v4 model simpler than v3 (native TypeScript support)
- Horizontally scalable if you move to Standard SWA later
- 45-second timeout acceptable for invoice operations (no real-time processing)

**Constraints respected:**
- No managed identity: use connection string in env var (SWA app settings)
- No persistent file system: store files in SQL or Blob Storage (not needed initially)
- Free-tier limits: typical request <1 sec; database 5-10 sec on first wake-up

**Alternatives considered:**
- Azure App Service: More control, but costs 
- AWS Lambda: Different cloud; you chose Azure
- Container in AKS: Overkill and costs 

**Reversibility:** Medium-high. Migrate to Flex Consumption Function App (Central India) later with config change only.

---

### 3. Database: Azure SQL Database (Free Tier, Temporal Tables)
**Decision:** Use SQL Server system-versioned temporal tables for audit history.
**Why:**
- Automatic versioning on every UPDATE/DELETE
- Zero trigger maintenance
- Built-in time-travel queries (AS OF DATE)
- Audit columns still required (CreatedBy, ModifiedBy, CorrelationId)
- Perfect for compliance + reprinting old invoices

**If temporal not supported in your region/tier:**
- Fallback: Trigger-based history tables (same outcome, 30% more code)

**Alternatives considered:**
- Event sourcing: Overkill, requires eventual consistency
- Change Data Capture (CDC): Complex, requires maintenance
- Application-level versioning: Error-prone

**Reversibility:** High. Trigger approach is drop-in replacement.

---

### 4. Error Handling: Three-Layer Logging with Correlation IDs
**Decision:** Every error is captured at UI ? API ? Database, linked by CorrelationId.
**Why:**
- Single source of truth: one log.ErrorLog table + Application Insights
- Traceability: user gets reference ID "7F3A-21C9", admin finds exact issue
- Extensible: error codes catalogue drives user messages + how-to-fix docs
- Fallback to Application Insights if database is paused (free tier resilience)

**Alternatives considered:**
- Centralized logging only (no DB table): lose querying/alerting capability
- Multiple log systems: harder to correlate

**Reversibility:** High. Can switch to different logging platform later.

---

### 5. Authentication: Microsoft Entra ID via Azure SWA
**Decision:** Use SWA built-in auth provider (Microsoft Entra, X-MS-CLIENT-PRINCIPAL header).
**Why:**
- Zero auth code to write
- Built into Static Web Apps at no extra cost
- Allow-list in database: flexible access control without directory sync
- Users sign in with work emails (Zoho@domain email registered in Entra)

**Testing strategy:**
- Local: SWA CLI emulated auth (--auth=simulated) in dev
- CI: GitHub secret stores test user credentials, Playwright uses direct sign-in
- Can add test-only auth mode if needed (check environment variable)

**Alternatives considered:**
- Custom JWT: More control, but requires certificate management
- OAuth2 provider: Zoho Mail doesn't have OAuth; Azure AD is default

**Reversibility:** Medium. Migrating to different auth provider requires UI + API changes.

---

### 6. Testing Strategy: Multiple Automated Layers
**Decision:** Unit + DB + API + E2E + Output verification + Accessibility.
**Why:**
- Catches bugs at every layer
- High confidence in regressions (especially for Excel/PDF generation)
- Meets compliance & audit requirements

**Tools chosen:**
| Layer | Tool | Reason |
|---|---|---|
| Unit | Vitest | Fast, ESM, TS support, works in browser + Node |
| DB | tSQLt or T-SQL integration | Direct procedure testing |
| API | Supertest + Vitest | Simple, fast, contract validation |
| E2E | Playwright | Multi-browser, video on failure, mobile emulation |
| Output | Golden file diffs | Regression detection for generated files |
| Accessibility | axe-core | WCAG compliance, built into Playwright |

**CI/CD Target:** <10 min per PR (parallelized), free Actions minutes.

**Reversibility:** High. Each layer independent; can swap Vitest for Jest, etc.

---

## DECISIONS AWAITING YOUR APPROVAL

### Question 1: Invoice Number Generation
**Options:**
- A: User provides + validated as unique
- B: Server auto-generates (SMI-YYYY-MM-{seq})

**Recommendation:** B (auto-generate). Why:
- Guarantees uniqueness
- No user confusion
- Matches modern invoice systems
- Can be customized per vendor later (Phase 2)

**Your preference?** ✅ **B (auto-generate)** — APPROVED

---

### Question 2: Concurrent Edit Conflict Resolution
**Options:**
- A: Last-write-wins (risky, can lose data silently)
- B: First-write-wins, second user gets 409 Conflict (must refresh & retry)

**Recommendation:** B (first-write-wins). Why:
- Creates audit trail of conflicts
- Forces explicit merge/retry decision
- Safer for invoice data

**Your preference?** ✅ **B (first-write-wins)** — APPROVED

---

### Question 3: SQL Temporal Tables
**Options:**
- A: Use system-versioned temporal tables (automatic)
- B: Use trigger-based history tables (more control, extra code)

**Recommendation:** A (temporal). Why:
- Less code to maintain
- Time-travel queries built-in
- Microsoft recommendation for SQL Server

**Fallback:** If not supported in your region, use option B.

**Your approval?** ✅ **A (temporal tables)** — APPROVED

---

### Question 4: Swagger UI Access (Production)
**Options:**
- A: Enable for admins only (role-based check in middleware)
- B: Disable completely in prod, enable in test only

**Recommendation:** A (admin-only). Why:
- Useful for debugging production issues
- API contract already public (OpenAPI file)
- Security: role check is cheap

**Your preference?** ✅ **A (admin-only)** — APPROVED

---

### Question 5: Email Service (Phase 3)
**Options:**
- A: Zoho SMTP (traditional, password-based)
- B: Zoho ZeptoMail API (modern, API-key based)

**Recommendation:** B (ZeptoMail API). Why:
- More reliable (dedicated mail service, not org SMTP)
- Modern authentication (no passwords in code)
- Better logging/bounce handling
- Free tier available

**Cost estimate:** ~ (free tier for your volume)

**Your approval?** ⏳ **DEFERRED to Phase 3 planning** — Will revisit when implementing email feature

---

## HOW TO USE THIS DOCUMENT

1. **Every decision records:**
   - What: The choice made
   - Why: Business + technical rationale
   - Alternatives: Other options considered
   - Reversibility: How hard to undo

2. **Add new decisions as you approve questions above:**
   - I'll append them here in subsequent steps
   - Every PR should update this file if architecture changes

3. **Reference in code reviews:**
   - If someone suggests a different approach, check this file first
   - If it conflicts, update the decision + explain why

---

**STATUS:** Awaiting your answers to Questions 1�5 above.

**NEXT STEP:** Once approved, move to Step 3 (Test Catalogue + Baseline Tests).
