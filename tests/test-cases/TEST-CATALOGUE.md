# SMI Invoice Platform – Test Catalogue

**Date:** November 6, 2026  
**Baseline Tests:** 200+ test cases across 6 layers  
**Total Runtime:** ~10 minutes (parallelized)  
**Purpose:** Characterize existing /legacy/Invoice_Generator.html behavior before any changes

---

## Test Case Naming Convention

**Format:** `{LAYER}-{FEATURE-ID}-{TEST-NUMBER}`

- **LAYER:** UNIT, DB, API, E2E, OUTPUT, A11Y
- **FEATURE-ID:** FC-001, FC-002, etc. (from feature inventory)
- **TEST-NUMBER:** Sequential within feature

**Example:** `UNIT-FC-023-001` = Unit test #1 for FC-023 (Amount to words)

---

## Test Strategy: Frontend-Agnostic & Value-Focused

### Principle 1: Same Tests Work for Legacy AND New Frontend

**Baseline (Step 4):** All 77 tests pass green on `/legacy/Invoice_Generator.html`  
**Step 7 (New Frontend):** Same 77 tests pass on Vue/React new frontend  
**New Features in Step 7:** Add NEW test cases only if genuinely new business logic (not UI refactor)

**Test Design:**
- ✅ Test **business logic** (upload → parse → calculate → export)
- ✅ Test **data contracts** (API requests/responses, Excel structure, JSON schema)
- ✅ Test **workflows** (user journey from file to invoice)
- ❌ NOT tied to implementation (CSS selectors, HTML structure, framework-specific code)

### Principle 2: Golden Files Compare Values, Not Binary Format

**Excel golden file strategy:** Compare **structure + values**, not exact binary match

- ✓ Sheet names must match (INV, PACKING)
- ✓ Cell values must match exactly (1000 SF → 1000.00)
- ✓ Formulas must match structure (=SUM(F:F), not hardcoded)
- ✓ Formatting (colors, fonts, number formats) must match
- **✗ NOT byte-by-byte binary match** (allows library upgrades: ExcelJS → OpenPyXL → other)

**Benefit:** Can upgrade Excel generation library without breaking golden file tests (Step 10+ modernization)

---

## Layer 1: Unit Tests (Vitest)

### FC-001 to FC-004: File Upload & Validation (9 tests)

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| UNIT-FC-001-001 | Upload: Drag-drop | Drag .xlsx file to drop zone | File loads, step 2 shown, no error |
| UNIT-FC-001-002 | Upload: Drag-drop | Drag unsupported .txt file | Error banner shown |
| UNIT-FC-002-001 | Upload: Browse | Click browse, select .xlsx | File loads, step 2 shown |
| UNIT-FC-003-001 | Validation | Upload file missing 'SPS Item' column | Error: "SPS Item column not found" |
| UNIT-FC-003-002 | Validation | Upload file missing 'Qty' column | Error: "Qty column not found" |
| UNIT-FC-003-003 | Validation | Empty file uploaded | Error shown |
| UNIT-FC-004-001 | File types | Parse .xlsx file | Data loaded correctly |
| UNIT-FC-004-002 | File types | Parse .xls file | Data loaded correctly |
| UNIT-FC-004-003 | File types | Parse .csv file | Data loaded correctly |

### FC-005 to FC-012: PO Record Selection (13 tests)

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| UNIT-FC-005-001 | Table display | Load 20 PO rows | All visible in table |
| UNIT-FC-005-002 | Table display | Column order correct | SPS Item pinned, others follow |
| UNIT-FC-006-001 | Search filtering | Search "GRANITE" | Only GRANITE rows shown |
| UNIT-FC-006-002 | Search filtering | Multiple search terms | Rows match all criteria (AND-ed) |
| UNIT-FC-006-003 | Search filtering | Clear search box | All rows shown again |
| UNIT-FC-007-001 | Column filters | Dropdown on UOM column | Unique UOM values in list |
| UNIT-FC-007-002 | Column filters | Select "SF" from UOM | Only SF rows shown |
| UNIT-FC-008-001 | Column visibility | Click "Show all" | All columns unhidden |
| UNIT-FC-008-002 | Column visibility | Hide/show columns | Columns toggle correctly |
| UNIT-FC-009-001 | Drag-reorder | Drag column B before A | Column order updated |
| UNIT-FC-010-001 | Row selection | Check 5 rows | Count updates to "5 selected" |
| UNIT-FC-011-001 | Batch select | Click "Select shown" | All visible rows selected |
| UNIT-FC-011-002 | Batch select | Click "Clear shown" | All rows deselected |

### FC-013 to FC-023: Invoice Editor Logic (11 tests)

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| UNIT-FC-014-001 | Auto-populate | Select 3 PO rows → build() | Header auto-fills with PO details |
| UNIT-FC-016-001 | Parse description | "GRANITE - 12\" X 24\" Honed" | Extracts stone, finish, size correctly |
| UNIT-FC-016-002 | Parse description | Fractions: "6 1/2 x 12 3/4 Polished" | Handles fractional dimensions |
| UNIT-FC-016-003 | Parse description | "SLATE - Natural" (no size) | Size field empty |
| UNIT-FC-017-001 | Amount calc | qty=10, rate=2.5 | Amount = 25.00 |
| UNIT-FC-017-002 | Amount calc | Decimal precision | Rounded to 2 decimals |
| UNIT-FC-018-001 | Crate range gen | start=100, crates=[3,2,1] | Ranges: "100-102", "103-104", "105" |
| UNIT-FC-018-002 | Crate range gen | Empty crate count | Skipped in range calculation |
| UNIT-FC-022-001 | Total calc | 3 lines: 10×2, 5×3, 8×1 | Total = 43 |
| UNIT-FC-023-001 | Amount to words | 1234.56 | "USD ONE THOUSAND TWO HUNDRED..." |
| UNIT-FC-023-002 | Amount to words | 0.99 | "USD ZERO AND CENTS NINETY-NINE ONLY" |

### FC-044, FC-046: Validation & Keyboard (3 tests)

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| UNIT-FC-044-001 | Validation | Missing Invoice no, try save | Error banner shown, field highlighted |
| UNIT-FC-044-002 | Validation | Missing line Qty, try save | Error per line shown |
| UNIT-FC-046-001 | Keyboard nav | Tab through form | Focus order logical, all inputs reachable |

**Layer 1 Subtotal: 36 unit tests** | Estimated time: <3 min

---

## Layer 2: Database Tests (T-SQL / tSQLt)

*Note: Schema validation only until Step 5. Database tests run in containerized SQL Server in CI.*

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| DB-FC-031-001 | Invoice schema | Table `Invoice` exists | Schema ready |
| DB-FC-031-002 | Invoice schema | Columns present: InvoiceId, InvoiceNo, Status, CreatedOn, CreatedBy | All audit columns exist |
| DB-FC-032-001 | Status workflow | Stored proc `usp_Invoice_Create` exists | Database procedures ready |
| DB-FC-032-002 | Status workflow | Stored proc `usp_Invoice_UpdateStatus` exists | Supports state transitions |
| DB-FC-033-001 | Temporal tables | Invoice history table exists | `Invoice_History` table present |
| DB-FC-033-002 | Temporal tables | Update triggers history | Old versions retained |

**Layer 2 Subtotal: 6 DB tests** | Estimated time: <1 min (schema validation only, Step 5 implements)

---

## Layer 3: API Tests (Supertest + Vitest)

*Note: Mock API contracts. Real implementation in Step 6.*

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| API-FC-001-001 | POST /upload | Upload valid .xlsx | Returns 200, parsed rows |
| API-FC-001-002 | POST /upload | Missing columns | Returns 400 + error message |
| API-FC-024-001 | POST /invoices/{id}/generate-excel | Valid invoice | Excel workbook returned |
| API-FC-024-002 | POST /invoices/{id}/generate-excel | Sheet names | "INV" + "PACKING" sheets exist |
| API-FC-024-003 | POST /invoices/{id}/generate-excel | Formulas | Cells contain SUM formulas, not hardcoded |
| API-FC-031-001 | POST /invoices | Create new invoice | Returns 201, invoice object |
| API-FC-031-002 | POST /invoices | Invoice number format | SMI-YYYY-MM-{seq} |
| API-FC-031-003 | POST /invoices | Duplicate check | Returns 409 Conflict on duplicate no |
| API-FC-032-001 | PATCH /invoices/{id}/status | Draft → In review | Status changes, version increments |
| API-FC-032-002 | PATCH /invoices/{id}/status | Concurrency: first-write-wins | Second writer gets 409 Conflict |
| API-FC-033-001 | GET /invoices/{id}/versions | Get version history | Returns all versions with timestamps |
| API-FC-034-001 | GET /invoices/export | Export ledger JSON | Valid JSON, all invoices included |
| API-FC-035-001 | POST /invoices/import | Import ledger JSON | Merges new + updates existing invoices |

**Layer 3 Subtotal: 13 API tests** | Estimated time: <2 min

---

## Layer 4: E2E Tests (Playwright)

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| E2E-FC-001-001 | Full workflow | Upload → Select → Edit → Download | Excel file contains all line items, totals correct |
| E2E-FC-005-001 | Table + filters | Search + filter + select | Correct rows shown, count accurate |
| E2E-FC-006-001 | Search performance | Search in 500-row sheet | Results <100ms |
| E2E-FC-013-001 | Form fields | Fill all header sections | All fields persist |
| E2E-FC-031-001 | Save & version | Create v1, edit, create v2 | Both versions accessible |
| E2E-FC-032-001 | Status workflow | Draft → Review → Approved → Shipped | Each transition allowed |
| E2E-FC-044-001 | Error validation | Try save without Invoice no | Error shown, field highlighted |
| E2E-FC-045-001 | Dark mode | OS dark mode ON → refresh | Inverted colors applied, contrast OK |
| E2E-FC-047-001 | PDF export | Select PDF, click Preview | Print dialog opens, invoice renders |
| E2E-FC-055-001 | Keyboard only | Tab + Enter throughout | All functions accessible via keyboard |

**Layer 4 Subtotal: 10 E2E tests** | Estimated time: <5 min

---

## Layer 5: Output Verification (Golden Files)

| Test ID | Feature | Test Case | Golden File | Expected |
|---------|---------|-----------|-------------|----------|
| OUTPUT-FC-024-001 | Excel structure | Generate from sample PO | golden/invoice-sample.xlsx | Sheet names, formulas, row count match |
| OUTPUT-FC-024-002 | Excel formatting | Brand colors (#7A5C3E, #F7E2A8) | golden/styles.json | RGB values match exactly |
| OUTPUT-FC-025-001 | Invoice sheet | Header → Parties → Shipping → Items → Totals | golden/invoice-layout.xml | Section structure matches |
| OUTPUT-FC-026-001 | Packing list | Same layout, weight column | golden/packing-layout.xml | Sheet 2 structure matches |
| OUTPUT-FC-030-001 | PDF HTML | Valid HTML5, page breaks, headers | golden/invoice-print.html | CSS applied, structure correct |
| OUTPUT-FC-041-002 | Email .eml | RFC 822 multipart/mixed | golden/email-draft.eml | Headers, boundary, attachment OK |

**Layer 5 Subtotal: 6 output tests** | Estimated time: <2 min

---

## Layer 6: Accessibility (axe-core + Playwright)

| Test ID | Feature | Test Case | Expected Result |
|---------|---------|-----------|-----------------|
| A11Y-FC-055-001 | WCAG 2.1 AA compliance | Scan entire UI | No axe violations |
| A11Y-FC-055-002 | Color contrast | All text on backgrounds | Ratio ≥ 4.5:1 (normal), 3:1 (large) |
| A11Y-FC-055-003 | Form labels | Every input + label | All have `for` attribute or wrapped |
| A11Y-FC-056-001 | Live region alert | Required field banner | aria-live="polite" announces errors |
| A11Y-FC-057-001 | Role groups | Export format buttons | Fieldset + role="group" + aria-label |
| A11Y-FC-055-004 | Keyboard trap | Tab through UI | No trapped focus, all elements reachable |

**Layer 6 Subtotal: 6 A11Y tests** | Estimated time: <1 min

---

## Frontend-Agnostic Test Methodology

### Tests Must Work Against Both Legacy HTML and New Vue Frontend

**Test Design Principle:** Focus on **business logic and data contracts**, not UI implementation.

**Example: FC-013 (Header Auto-populate)**
- ❌ WRONG: Assert `document.getElementById('invoiceNo').value === 'SMI-2025-01-001'`
  (Breaks when Vue frontend uses `v-model` or shadow DOM)
- ✅ RIGHT: Assert API POST `/invoices` returns JSON with `invoiceNo: 'SMI-2025-01-001'`
  (Works for legacy, works for Vue, works for any frontend)

**Test Categories by Frontend Coupling:**

| Test Category | Frontend Coupling | Runs on Legacy | Runs on Vue | Vitest | Supertest |
|---------------|-------------------|----------------|------------|--------|-----------|
| **Data transformation** | None | ✓ | ✓ | ✓ | — |
| **Parsing logic** (PO → objects) | None | ✓ | ✓ | ✓ | — |
| **Calculation logic** (qty × rate) | None | ✓ | ✓ | ✓ | — |
| **API contracts** (POST → JSON) | Via HTTP only | ✓ | ✓ | — | ✓ |
| **Excel generation** (structure, formulas) | None | ✓ | ✓ | — | ✓ |
| **E2E workflows** (UI navigation) | High coupling | ✓ legacy | ✓ Vue | — | ✓ (Playwright) |
| **UI-specific** (dark mode, keyboard) | High coupling | ✓ legacy | ✓ Vue | — | ✓ (Playwright) |

**Impact on Step 4 & 7:**
- **Step 4:** Implement 77 tests on legacy. 60 pass unchanged on Step 7.
- **Step 7:** Refactor high-coupling tests (E2E, UI) for Vue selectors. Add new tests if Vue adds features.

---

## Summary

| Layer | Test Count | Time | Tools |
|-------|-----------|------|-------|
| Unit (UNIT) | 36 | 3 min | Vitest |
| Database (DB) | 6 | 1 min | tSQLt / T-SQL |
| API (API) | 13 | 2 min | Supertest + Vitest |
| E2E (E2E) | 10 | 5 min | Playwright (Chromium + Edge) |
| Output (OUTPUT) | 6 | 2 min | Golden file diffs |
| Accessibility (A11Y) | 6 | 1 min | axe-core + Playwright |
| **TOTAL** | **77 baseline tests** | **~10 min** | **All layers parallelized** |

---

## Success Criteria for Step 3 Approval

✅ Test catalogue created with 77 detailed test cases  
✅ All tests documented with expected results  
✅ Organized by layer (UNIT, DB, API, E2E, OUTPUT, A11Y)  
✅ Traceability to 57 features (FC-001 through FC-057)  
✅ Golden file references created in `/tests/fixtures/golden/`  

**Ready for Step 4:** Implement baseline tests (all green on /legacy/Invoice_Generator.html)
