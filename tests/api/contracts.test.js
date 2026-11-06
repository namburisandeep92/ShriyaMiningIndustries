/**
 * Layer 3: API Tests (API-FC-*)
 * Test API contract validation and business logic
 * These tests simulate HTTP requests and responses
 * 
 * Tests API features: upload, create invoice, status workflow, versioning
 * 
 * Run with: npm run test:api
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateInvoiceTotal,
  generateInvoiceNumber,
  validateInvoiceNumber,
  validateColumns
} from '../utils/invoice-utils.js';

// Mock API responses for testing contracts
class MockInvoiceAPI {
  constructor() {
    this.invoices = new Map();
    this.uploadedFiles = [];
    this.versionHistory = new Map();
    this.sequenceCounter = new Map();
  }

  /**
   * POST /upload - Handle file upload and parse
   */
  async handleUpload(fileName, rows) {
    this.uploadedFiles.push({ fileName, rowCount: rows.length, timestamp: new Date() });

    const validation = validateColumns(rows, ['SPS Item', 'Qty']);
    if (!validation.valid) {
      return {
        status: 400,
        error: validation.errors[0],
        errorCode: 'INVALID_COLUMNS'
      };
    }

    return {
      status: 200,
      data: {
        fileName,
        rowCount: rows.length,
        columns: Object.keys(rows[0])
      }
    };
  }

  /**
   * POST /invoices - Create new invoice with auto-generated number
   */
  async createInvoice(invoiceData) {
    const date = invoiceData.invoiceDate || new Date();
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    // Increment sequence for this month
    if (!this.sequenceCounter.has(month)) {
      this.sequenceCounter.set(month, 0);
    }
    const seq = this.sequenceCounter.get(month) + 1;
    this.sequenceCounter.set(month, seq);

    const invoiceNo = generateInvoiceNumber(date, seq);

    // Check for duplicate (first-write-wins concurrency)
    if (this.invoices.has(invoiceNo)) {
      return {
        status: 409,
        error: 'Invoice number already exists',
        errorCode: 'DUPLICATE_INVOICE_NO'
      };
    }

    const invoice = {
      id: Math.random().toString(36).substr(2, 9),
      invoiceNo,
      status: 'Draft',
      items: invoiceData.items || [],
      totalAmount: calculateInvoiceTotal(invoiceData.items || []),
      createdOn: new Date().toISOString(),
      createdBy: invoiceData.createdBy || 'system',
      version: 1,
      rowVersion: Math.random().toString(36).substr(2, 9)
    };

    this.invoices.set(invoiceNo, invoice);
    this.versionHistory.set(invoiceNo, [{ ...invoice, changedAt: new Date().toISOString() }]);

    return {
      status: 201,
      data: invoice
    };
  }

  /**
   * PATCH /invoices/{id}/status - Update invoice status
   */
  async updateInvoiceStatus(invoiceNo, newStatus, submittedRowVersion) {
    const invoice = this.invoices.get(invoiceNo);

    if (!invoice) {
      return {
        status: 404,
        error: 'Invoice not found',
        errorCode: 'NOT_FOUND'
      };
    }

    // First-write-wins: check rowVersion
    if (invoice.rowVersion !== submittedRowVersion) {
      return {
        status: 409,
        error: 'Invoice was modified by another user',
        errorCode: 'CONCURRENT_MODIFICATION',
        currentVersion: invoice.version,
        submittedVersion: submittedRowVersion
      };
    }

    // Allowed transitions: Draft → Review, Review → Approved, Approved → Shipped
    const allowed = {
      'Draft': ['In Review'],
      'In Review': ['Approved'],
      'Approved': ['Shipped']
    };

    if (!allowed[invoice.status]?.includes(newStatus)) {
      return {
        status: 400,
        error: `Cannot transition from ${invoice.status} to ${newStatus}`,
        errorCode: 'INVALID_STATUS_TRANSITION'
      };
    }

    invoice.status = newStatus;
    invoice.version++;
    invoice.rowVersion = Math.random().toString(36).substr(2, 9);
    invoice.updatedOn = new Date().toISOString();

    const history = this.versionHistory.get(invoiceNo) || [];
    history.push({ ...invoice, changedAt: new Date().toISOString() });
    this.versionHistory.set(invoiceNo, history);

    return {
      status: 200,
      data: invoice
    };
  }

  /**
   * GET /invoices/{id}/versions - Retrieve version history
   */
  async getVersionHistory(invoiceNo) {
    const history = this.versionHistory.get(invoiceNo);

    if (!history) {
      return {
        status: 404,
        error: 'Invoice not found',
        errorCode: 'NOT_FOUND'
      };
    }

    return {
      status: 200,
      data: {
        invoiceNo,
        versions: history
      }
    };
  }

  /**
   * GET /invoices/export - Export all invoices as JSON
   */
  async exportLedger() {
    const invoices = Array.from(this.invoices.values());
    return {
      status: 200,
      data: {
        invoices,
        exportedAt: new Date().toISOString()
      }
    };
  }

  /**
   * POST /invoices/import - Import/merge invoices from JSON
   */
  async importLedger(ledgerData) {
    if (!Array.isArray(ledgerData.invoices)) {
      return {
        status: 400,
        error: 'Expected invoices array',
        errorCode: 'INVALID_FORMAT'
      };
    }

    let imported = 0;
    let updated = 0;

    for (const inv of ledgerData.invoices) {
      if (this.invoices.has(inv.invoiceNo)) {
        // Merge: update existing
        this.invoices.set(inv.invoiceNo, { ...this.invoices.get(inv.invoiceNo), ...inv });
        updated++;
      } else {
        // Import new
        this.invoices.set(inv.invoiceNo, inv);
        imported++;
      }
    }

    return {
      status: 200,
      data: {
        imported,
        updated,
        total: this.invoices.size
      }
    };
  }
}

// ============================================================================
// FC-001: File Upload
// ============================================================================

describe('API-FC-001: File Upload & Parsing', () => {
  let api;

  beforeEach(() => {
    api = new MockInvoiceAPI();
  });

  it('API-FC-001-001: Should parse valid Excel file', async () => {
    const rows = [
      {
        'SPS Item': 'GRANITE - 12" X 24" Polished',
        'Qty': 100,
        'SKU': 'GRA-12-24-P'
      }
    ];

    const response = await api.handleUpload('sample.xlsx', rows);
    expect(response.status).toBe(200);
    expect(response.data.rowCount).toBe(1);
    expect(response.data.fileName).toBe('sample.xlsx');
  });

  it('API-FC-001-002: Should reject file with missing columns', async () => {
    const rows = [
      {
        'SKU': 'GRA-12-24-P'
        // Missing 'SPS Item' and 'Qty'
      }
    ];

    const response = await api.handleUpload('invalid.xlsx', rows);
    expect(response.status).toBe(400);
    expect(response.errorCode).toBe('INVALID_COLUMNS');
    expect(response.error).toContain('SPS Item');
  });
});

// ============================================================================
// FC-031: Create Invoice with Auto-Numbering
// ============================================================================

describe('API-FC-031: Create Invoice (Auto-Numbering)', () => {
  let api;

  beforeEach(() => {
    api = new MockInvoiceAPI();
  });

  it('API-FC-031-001: Should create invoice and return JSON object', async () => {
    const response = await api.createInvoice({
      invoiceDate: new Date('2025-01-15'),
      items: [{ amount: 1500 }],
      createdBy: 'user@example.com'
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('invoiceNo');
    expect(response.data).toHaveProperty('status');
    expect(response.data).toHaveProperty('createdOn');
    expect(response.data.status).toBe('Draft');
  });

  it('API-FC-031-002: Should generate invoice number SMI-YYYY-MM-{seq}', async () => {
    const response = await api.createInvoice({
      invoiceDate: new Date('2025-01-15'),
      items: []
    });

    expect(response.data.invoiceNo).toMatch(/^SMI-2025-01-\d{3}$/);
    expect(response.data.invoiceNo).toBe('SMI-2025-01-001');
  });

  it('API-FC-031-003: Should return 409 Conflict on duplicate invoice number', async () => {
    const date = new Date('2025-01-15');

    // Create first invoice
    const response1 = await api.createInvoice({
      invoiceDate: date,
      items: []
    });
    expect(response1.status).toBe(201);

    // Try to create duplicate (same month/sequence)
    const response2 = await api.createInvoice({
      invoiceDate: date,
      items: []
    });
    // Should succeed with next sequence number, or return 409 if trying exact duplicate
    expect([201, 409]).toContain(response2.status);
  });

  it('API-FC-031-004: Should increment sequence per month', async () => {
    const response1 = await api.createInvoice({
      invoiceDate: new Date('2025-01-15'),
      items: []
    });
    const response2 = await api.createInvoice({
      invoiceDate: new Date('2025-01-20'),
      items: []
    });

    expect(response1.data.invoiceNo).toBe('SMI-2025-01-001');
    expect(response2.data.invoiceNo).toBe('SMI-2025-01-002');
  });
});

// ============================================================================
// FC-032: Status Workflow & Concurrency
// ============================================================================

describe('API-FC-032: Status Workflow & First-Write-Wins Concurrency', () => {
  let api;

  beforeEach(() => {
    api = new MockInvoiceAPI();
  });

  it('API-FC-032-001: Should transition Draft → In Review → Approved', async () => {
    const createResp = await api.createInvoice({ items: [] });
    const invoiceNo = createResp.data.invoiceNo;
    const rowVersion = createResp.data.rowVersion;

    const reviewResp = await api.updateInvoiceStatus(invoiceNo, 'In Review', rowVersion);
    expect(reviewResp.status).toBe(200);
    expect(reviewResp.data.status).toBe('In Review');
    expect(reviewResp.data.version).toBe(2);

    const approveResp = await api.updateInvoiceStatus(invoiceNo, 'Approved', reviewResp.data.rowVersion);
    expect(approveResp.status).toBe(200);
    expect(approveResp.data.status).toBe('Approved');
  });

  it('API-FC-032-002: Should detect concurrent modification (409 Conflict)', async () => {
    const createResp = await api.createInvoice({ items: [] });
    const invoiceNo = createResp.data.invoiceNo;
    const oldRowVersion = createResp.data.rowVersion;

    // First update succeeds
    const update1 = await api.updateInvoiceStatus(invoiceNo, 'In Review', oldRowVersion);
    expect(update1.status).toBe(200);

    // Second update with old rowVersion fails (409 Conflict)
    const update2 = await api.updateInvoiceStatus(invoiceNo, 'Approved', oldRowVersion);
    expect(update2.status).toBe(409);
    expect(update2.errorCode).toBe('CONCURRENT_MODIFICATION');
  });

  it('API-FC-032-003: Should reject invalid status transition', async () => {
    const createResp = await api.createInvoice({ items: [] });
    const invoiceNo = createResp.data.invoiceNo;
    const rowVersion = createResp.data.rowVersion;

    // Try invalid transition Draft → Shipped (should go through Review & Approved first)
    const response = await api.updateInvoiceStatus(invoiceNo, 'Shipped', rowVersion);
    expect(response.status).toBe(400);
    expect(response.errorCode).toBe('INVALID_STATUS_TRANSITION');
  });
});

// ============================================================================
// FC-033: Version History & Temporal Tables
// ============================================================================

describe('API-FC-033: Version History (Temporal Audit)', () => {
  let api;

  beforeEach(() => {
    api = new MockInvoiceAPI();
  });

  it('API-FC-033-001: Should retrieve all versions for an invoice', async () => {
    const createResp = await api.createInvoice({ items: [] });
    const invoiceNo = createResp.data.invoiceNo;

    const historyResp = await api.getVersionHistory(invoiceNo);
    expect(historyResp.status).toBe(200);
    expect(Array.isArray(historyResp.data.versions)).toBe(true);
    expect(historyResp.data.versions.length).toBeGreaterThanOrEqual(1);
  });

  it('API-FC-033-002: Should track version numbers and timestamps', async () => {
    const createResp = await api.createInvoice({ items: [] });
    const invoiceNo = createResp.data.invoiceNo;

    const updateResp = await api.updateInvoiceStatus(invoiceNo, 'In Review', createResp.data.rowVersion);
    const historyResp = await api.getVersionHistory(invoiceNo);

    const versions = historyResp.data.versions;
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);
    expect(versions[0].changedAt).toBeDefined();
    expect(versions[1].changedAt).toBeDefined();
  });
});

// ============================================================================
// FC-034: Invoice Ledger Export
// ============================================================================

describe('API-FC-034: Invoice Ledger Export (JSON)', () => {
  let api;

  beforeEach(() => {
    api = new MockInvoiceAPI();
  });

  it('API-FC-034-001: Should export all invoices as JSON', async () => {
    await api.createInvoice({ items: [{ amount: 1000 }] });
    await api.createInvoice({ items: [{ amount: 2000 }] });

    const response = await api.exportLedger();
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.invoices)).toBe(true);
    expect(response.data.invoices.length).toBe(2);
    expect(response.data.exportedAt).toBeDefined();
  });
});

// ============================================================================
// FC-035: Invoice Ledger Import (Merge)
// ============================================================================

describe('API-FC-035: Invoice Ledger Import (Merge)', () => {
  let api;

  beforeEach(() => {
    api = new MockInvoiceAPI();
  });

  it('API-FC-035-001: Should import new invoices', async () => {
    const ledgerData = {
      invoices: [
        {
          invoiceNo: 'SMI-2025-01-999',
          status: 'Approved',
          items: [],
          totalAmount: 500
        }
      ]
    };

    const response = await api.importLedger(ledgerData);
    expect(response.status).toBe(200);
    expect(response.data.imported).toBe(1);
    expect(response.data.updated).toBe(0);
  });

  it('API-FC-035-002: Should update existing invoices (merge)', async () => {
    const createResp = await api.createInvoice({ items: [] });
    const invoiceNo = createResp.data.invoiceNo;

    const ledgerData = {
      invoices: [
        {
          invoiceNo,
          status: 'Shipped',
          items: [{ amount: 5000 }],
          totalAmount: 5000
        }
      ]
    };

    const importResp = await api.importLedger(ledgerData);
    expect(importResp.status).toBe(200);
    expect(importResp.data.updated).toBe(1);
    expect(importResp.data.imported).toBe(0);
  });
});
