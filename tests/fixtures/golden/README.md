# Test Fixtures – Golden Files & Sample Data

**Purpose:** Provide baseline input/output data for all test layers  
**Location:** `/tests/fixtures/`  
**Status:** Structure defined; actual files created in Step 4

---

## Directory Structure

```
/tests/fixtures/
├── po/
│   └── sample-po.xlsx                    # Input: Real PO from legacy tests
├── golden/
│   ├── invoice-sample.xlsx               # Output golden: Invoice from sample PO
│   ├── packing-list-golden.xlsx          # Output golden: Packing list sheet
│   ├── invoice-print.html                # Output golden: PDF preview HTML
│   ├── email-draft.eml                   # Output golden: RFC 822 email draft
│   ├── styles.json                       # Output golden: Brand color/font specs
│   ├── invoice-layout.xml                # Output golden: Invoice XML structure
│   └── packing-layout.xml                # Output golden: Packing XML structure
├── data/
│   ├── sample-ledger.json                # Input: 10 invoices for import test
│   ├── sample-ledger-v2.json             # Input: Updated ledger (merge test)
│   └── test-users.json                   # Input: User roles for auth tests (Step 6)
└── README.md                             # This file
```

---

## Sample Data Specifications

### sample-po.xlsx (Input)

**Purpose:** Multi-format test data for upload layer tests  
**Source:** /tests/fixtures/po/sample-po.xlsx  
**Format:** Microsoft Excel (.xlsx)

**Schema:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| SPS Item | Text | GRANITE - 12" X 24" Polished | Required, used for product parsing |
| SKU | Text | GRA-12-24-P | Unique product code |
| PO# | Text | PO-2025-001 | Customer PO reference |
| Qty | Number | 100 | Total quantity in primary UOM |
| UOM | Text | SF | Square Feet, Piece, etc. |
| SO Ref# | Text | SO-2025-0847 | Internal sales order |
| Supplier | Text | Acme Stone Co | Quarry/supplier name |
| Ship To | Text | Warehouse 2, Delhi | Delivery location |
| PO Date | Date | 2025-01-15 | Order date for sorting |

**Sample Rows (8 invoiceable items):**
```
Row 1: GRANITE - 12" X 24" Polished | GRA-12-24-P | PO-2025-001 | 1000 | SF | SO-2025-0847 | Acme Stone | Warehouse 2, Delhi | 2025-01-15
Row 2: GRANITE - 12" X 24" Honed | GRA-12-24-H | PO-2025-001 | 500 | SF | SO-2025-0847 | Acme Stone | Warehouse 2, Delhi | 2025-01-15
Row 3: SLATE - Natural | SLA-NAT-BULK | PO-2025-002 | 200 | Piece | SO-2025-0848 | Stone Ltd | Warehouse 1, Mumbai | 2025-01-16
Row 4: LIMESTONE - 6.5" x 12.75" Bush Hammered | LME-6.5-12.75-BH | PO-2025-002 | 50 | Piece | SO-2025-0848 | Stone Ltd | Warehouse 1, Mumbai | 2025-01-16
Row 5: TRAVERTINE - Filled Honed | TRV-FILLED-H | PO-2025-003 | 300 | SF | SO-2025-0849 | Premium Quarries | Branch, Bangalore | 2025-01-17
Row 6: BASALT - Split Faced | BSL-SPLIT | PO-2025-003 | 150 | SF | SO-2025-0849 | Premium Quarries | Branch, Bangalore | 2025-01-17
Row 7: MARBLE - Polished | MBL-POL | PO-2025-004 | 25 | Piece | SO-2025-0850 | White Star Inc | Warehouse 3, Hyderabad | 2025-01-18
Row 8: SANDSTONE - Sawn | SND-SAWN | PO-2025-004 | 400 | SF | SO-2025-0850 | White Star Inc | Warehouse 3, Hyderabad | 2025-01-18
```

---

### invoice-sample.xlsx (Output Golden)

**Purpose:** Expected Excel output when processing sample-po.xlsx  
**Generated from:** sample-po.xlsx via Excel generation logic  
**Success criteria:** Byte-by-byte match (for regression detection)

**Sheets:**
1. **INV** — Invoice sheet (rows 1-45, columns A-J)
   - Header: Invoice number (SMI-2025-01-001), date, parties
   - Items: 8 line items from sample PO
   - Formulas: `=SUM(F:F)` for total, amount-to-words in J2
   - Formatting: Brand colors (#7A5C3E stone, #F7E2A8 accent)

2. **PACKING** — Packing list sheet (rows 1-45, columns A-K)
   - Same layout as INV
   - Additional column K: Weight (calculated from Qty × per-unit weight)
   - Subtotal weight in K45

**Generated Example:**
```
Sheet: INV
A1: Invoice #: SMI-2025-01-001
A2: Date: 2025-01-15
A5: BILL TO:
A6: Customer
...
A15: ITEMS
B15: SPS Item | C15: SKU | D15: Qty | E15: UOM | F15: Rate | G15: Amount
Row 16: GRANITE - 12" X 24" Polished | GRA-12-24-P | 1000 | SF | 15.00 | 15000.00
...
G24: =SUM(G16:G23)  [Total line]
G25: Tax (5%)
G26: Final Total
J2: (Words) "USD ONE THOUSAND TWO HUNDRED..."
```

---

### packing-list-golden.xlsx (Output Golden)

**Purpose:** Verify packing list sheet structure and weight calculations  
**Format:** Golden file for golden-diff comparison  

**Unique sections:**
- Weight column (K): Per-item weight calculated
- Crate ranges (L): Generated from start # and item-level crate count
- Total weight (K45): Sum of all line weights
- Shipping instructions (Footer, rows 47-50)

---

### invoice-print.html (Output Golden)

**Purpose:** HTML structure for PDF print preview  
**Format:** HTML5 with CSS for print media

**Sections:**
- Header: SMI logo, invoice number, date
- Parties: Bill-to, Ship-to, PO reference
- Items table: Columns match Excel (SPS Item, SKU, Qty, Rate, Amount)
- Totals: Subtotal, tax, final total
- Footer: Payment terms, notes, "Thank you for your business"
- Page breaks: Inserted after 15 line items

**Success criteria:**
- Valid HTML5, no script errors
- CSS media query `@media print` applied
- Fonts: Serif (Invoice header), Sans-serif (body, tables)
- Colors: Must be RGB equivalent of brand (#7A5C3E → rgb(122, 92, 62))

---

### email-draft.eml (Output Golden)

**Purpose:** RFC 822 multipart email for Outlook draft  
**Format:** Text MIME message

**Structure:**
```
From: SMI Invoice <invoices@shriyamining.local>
To: [customer email from invoice]
Subject: Invoice SMI-2025-01-001
Content-Type: multipart/mixed; boundary="----boundary_12345"

------ boundary_12345
Content-Type: text/plain

Dear [Customer],

Please find attached Invoice SMI-2025-01-001...

------ boundary_12345
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="SMI-2025-01-001.xlsx"
Content-Transfer-Encoding: base64

[Base64 encoded Excel file]

------ boundary_12345
Content-Type: application/pdf; name="SMI-2025-01-001.pdf"
Content-Transfer-Encoding: base64

[Base64 encoded PDF]

------ boundary_12345--
```

**Success criteria:**
- RFC 822 compliant
- Boundary markers present and consistent
- MIME types correct for Excel + PDF
- Base64 encoding valid

---

### styles.json (Output Golden)

**Purpose:** Brand color, font, and formatting specs  
**Format:** JSON configuration

```json
{
  "colors": {
    "stone": "#7A5C3E",
    "stone_rgb": [122, 92, 62],
    "accent": "#F7E2A8",
    "accent_rgb": [247, 226, 168],
    "border": "#D3D3D3",
    "text": "#333333",
    "grid": "#EEEEEE"
  },
  "fonts": {
    "header": "Garamond",
    "body": "Calibri",
    "monospace": "Courier New"
  },
  "sizes": {
    "header_font_size": 16,
    "body_font_size": 11,
    "line_height": 1.5
  }
}
```

---

### sample-ledger.json (Input)

**Purpose:** Test data for invoice import/export tests  
**Format:** JSON array of invoice objects

**Schema:**
```json
{
  "invoices": [
    {
      "id": "12345",
      "invoiceNo": "SMI-2025-01-001",
      "status": "Draft",
      "header": { "customerName": "ABC Corp", "invoiceDate": "2025-01-15" },
      "items": [ { "spsItem": "GRANITE...", "qty": 100, "rate": 15.00 } ],
      "totals": { "amount": 1500.00, "tax": 75.00 },
      "versions": 1,
      "createdOn": "2025-01-15T10:00:00Z"
    },
    ...
  ]
}
```

**Sample:** 10 invoices in various states (Draft, In Review, Approved, Shipped)

---

## Test Fixtures Checklist

### Layer 1 Unit Tests
- [ ] sample-po.xlsx loaded in memory, parsed into object array
- [ ] Expected column set validated
- [ ] Crate range calculation tested with golden arrays

### Layer 2 DB Tests
- [ ] Schema queries validate table/column existence
- [ ] No fixture files needed (schema validation only)

### Layer 3 API Tests
- [ ] sample-po.xlsx uploaded via POST /upload, returns JSON
- [ ] sample-ledger.json imported via POST /import
- [ ] Golden invoice JSON compared to actual POST response

### Layer 4 E2E Tests
- [ ] sample-po.xlsx uploaded via browser UI
- [ ] Full workflow end-to-end
- [ ] Excel download compared to invoice-sample.xlsx (byte-by-byte)
- [ ] PDF preview matches invoice-print.html structure

### Layer 5 Output Tests
- [ ] Generate Excel from sample PO → diff vs invoice-sample.xlsx
- [ ] Generate PDF HTML → diff vs invoice-print.html
- [ ] Email .eml generation → diff vs email-draft.eml

### Layer 6 A11Y Tests
- [ ] HTML structure validated with axe-core
- [ ] No fixture files needed (live page scanning)

---

## Golden File Maintenance

**When to update golden files:**
- Only when architectural decision explicitly changes (e.g., new color scheme, layout)
- Never automatically regenerate to match current output (defeats regression purpose)
- Always review changes in git diff before committing

**Diff comparison strategy:**
- Excel: Compare row count, formula structure, cell values (tolerate minor formatting)
- PDF HTML: Compare element hierarchy, font-family, color RGB values
- Email .eml: Compare MIME boundary markers, Content-Type headers, base64 integrity

---

## Ready for Step 4

All golden file specifications ready. In Step 4:
1. Actual files will be generated from /legacy/Invoice_Generator.html
2. Files committed to repo as regression baseline
3. Each test layer will use these files for validation
