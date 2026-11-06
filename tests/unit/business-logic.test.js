/**
 * Layer 1: Unit Tests (UNIT-FC-*)
 * Test pure business logic functions with no DOM/API/DB dependencies
 * 
 * Tests extracted features FC-001 through FC-023
 * Focus: calculations, parsing, validation, formatting
 * 
 * Run with: npm run test:unit
 */

import { describe, it, expect } from 'vitest';
import {
  calculateLineAmount,
  calculateInvoiceTotal,
  parseProductDescription,
  generateCrateRanges,
  amountToWords,
  generateInvoiceNumber,
  formatCurrency,
  calculateTax,
  validateInvoiceNumber,
  validateColumns,
  invoiceDataMatches
} from '../utils/invoice-utils.js';

// ============================================================================
// FC-001 to FC-004: Upload & File Validation
// ============================================================================

describe('UNIT-FC-003: Column Validation', () => {
  it('UNIT-FC-003-001: Should accept file with required columns', () => {
    const rows = [
      {
        'SPS Item': 'GRANITE - 12" X 24" Polished',
        'Qty': 100,
        'SKU': 'GRA-12-24-P',
        'UOM': 'SF'
      }
    ];

    const result = validateColumns(rows, ['SPS Item', 'Qty']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('UNIT-FC-003-002: Should reject file missing required columns', () => {
    const rows = [
      {
        'SKU': 'GRA-12-24-P',
        'UOM': 'SF'
        // Missing 'SPS Item' and 'Qty'
      }
    ];

    const result = validateColumns(rows, ['SPS Item', 'Qty']);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Missing required columns');
  });

  it('UNIT-FC-003-003: Should reject empty file', () => {
    const result = validateColumns([], ['SPS Item', 'Qty']);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No data rows found in file');
  });
});

// ============================================================================
// FC-017: Line Amount Calculation
// ============================================================================

describe('UNIT-FC-017: Line Amount Calculation', () => {
  it('UNIT-FC-017-001: Should calculate line amount (qty × rate)', () => {
    const amount = calculateLineAmount(10, 2.5);
    expect(amount).toBe(25.00);
  });

  it('UNIT-FC-017-002: Should round to 2 decimals', () => {
    const amount = calculateLineAmount(3, 10.333);
    expect(amount).toBe(31.00);
  });

  it('UNIT-FC-017-003: Should handle edge case: zero quantity', () => {
    const amount = calculateLineAmount(0, 100);
    expect(amount).toBe(0);
  });

  it('UNIT-FC-017-004: Should handle decimal quantities', () => {
    const amount = calculateLineAmount(1.5, 20);
    expect(amount).toBe(30);
  });
});

// ============================================================================
// FC-022: Invoice Total Calculation
// ============================================================================

describe('UNIT-FC-022: Invoice Total Calculation', () => {
  it('UNIT-FC-022-001: Should sum all line amounts', () => {
    const lines = [
      { amount: 10 },
      { amount: 5 },
      { amount: 3 }
    ];
    const total = calculateInvoiceTotal(lines);
    expect(total).toBe(18);
  });

  it('UNIT-FC-022-002: Should handle 3 lines: 10×2, 5×3, 8×1 = 43', () => {
    const lines = [
      { amount: 20 },
      { amount: 15 },
      { amount: 8 }
    ];
    const total = calculateInvoiceTotal(lines);
    expect(total).toBe(43);
  });

  it('UNIT-FC-022-003: Should return 0 for empty lines', () => {
    const total = calculateInvoiceTotal([]);
    expect(total).toBe(0);
  });

  it('UNIT-FC-022-004: Should handle null/invalid amounts', () => {
    const lines = [
      { amount: 10 },
      { amount: null },
      { amount: 5 }
    ];
    const total = calculateInvoiceTotal(lines);
    expect(total).toBe(15);
  });
});

// ============================================================================
// FC-016: Product Description Parsing
// ============================================================================

describe('UNIT-FC-016: Product Description Parsing', () => {
  it('UNIT-FC-016-001: Should parse "GRANITE - 12\\" X 24\\" Polished"', () => {
    const desc = 'GRANITE - 12" X 24" Polished';
    const result = parseProductDescription(desc);
    expect(result.stone).toBe('GRANITE');
    expect(result.size).toContain('12');
    expect(result.size).toContain('24');
    expect(result.finish).toBe('Polished');
  });

  it('UNIT-FC-016-002: Should handle fractional dimensions "6 1/2 x 12 3/4 Honed"', () => {
    const desc = 'MARBLE - 6 1/2 x 12 3/4 Honed';
    const result = parseProductDescription(desc);
    expect(result.stone).toBe('MARBLE');
    expect(result.finish).toBe('Honed');
  });

  it('UNIT-FC-016-003: Should handle "SLATE - Natural" (no size)', () => {
    const desc = 'SLATE - Natural';
    const result = parseProductDescription(desc);
    expect(result.stone).toBe('SLATE');
    expect(result.size).toBe('');
    expect(result.finish).toBe('Natural');
  });

  it('UNIT-FC-016-004: Should handle empty description', () => {
    const result = parseProductDescription('');
    expect(result.stone).toBe('');
    expect(result.size).toBe('');
    expect(result.finish).toBe('');
  });
});

// ============================================================================
// FC-018: Crate Range Generation
// ============================================================================

describe('UNIT-FC-018: Crate Range Generation', () => {
  it('UNIT-FC-018-001: Should generate ranges from start=100, crates=[3,2,1]', () => {
    const ranges = generateCrateRanges(100, [3, 2, 1]);
    expect(ranges).toEqual(['100-102', '103-104', '105']);
  });

  it('UNIT-FC-018-002: Should skip empty/zero crate counts', () => {
    const ranges = generateCrateRanges(10, [2, 0, 3]);
    expect(ranges).toEqual(['10-11', '12-14']);
  });

  it('UNIT-FC-018-003: Should handle single-crate ranges', () => {
    const ranges = generateCrateRanges(1, [1, 1, 1]);
    expect(ranges).toEqual(['1', '2', '3']);
  });

  it('UNIT-FC-018-004: Should handle empty crate array', () => {
    const ranges = generateCrateRanges(100, []);
    expect(ranges).toEqual([]);
  });
});

// ============================================================================
// FC-023: Amount to Words
// ============================================================================

describe('UNIT-FC-023: Amount to Words', () => {
  it('UNIT-FC-023-001: Should convert 1234.56 to words', () => {
    const words = amountToWords(1234.56);
    expect(words).toContain('ONE THOUSAND');
    expect(words).toContain('TWO HUNDRED');
    expect(words).toContain('ONLY');
  });

  it('UNIT-FC-023-002: Should convert 0.99 to words', () => {
    const words = amountToWords(0.99);
    expect(words).toContain('NINETY');
    expect(words).toContain('NINE');
    expect(words).toContain('ONLY');
  });

  it('UNIT-FC-023-003: Should convert 100 to words', () => {
    const words = amountToWords(100);
    expect(words).toContain('ONE HUNDRED');
    expect(words).toContain('ONLY');
  });

  it('UNIT-FC-023-004: Should handle zero amount', () => {
    const words = amountToWords(0);
    expect(words).toBe('ZERO');
  });
});

// ============================================================================
// FC-031: Invoice Number Generation
// ============================================================================

describe('UNIT-FC-031: Invoice Number Generation', () => {
  it('UNIT-FC-031-001: Should generate format SMI-YYYY-MM-{seq}', () => {
    const date = new Date('2025-01-15');
    const invoiceNo = generateInvoiceNumber(date, 1);
    expect(invoiceNo).toBe('SMI-2025-01-001');
  });

  it('UNIT-FC-031-002: Should pad sequence with zeros', () => {
    const date = new Date('2025-02-20');
    const invoiceNo = generateInvoiceNumber(date, 42);
    expect(invoiceNo).toBe('SMI-2025-02-042');
  });

  it('UNIT-FC-031-003: Should use current date if not provided', () => {
    const invoiceNo = generateInvoiceNumber();
    const pattern = /^SMI-\d{4}-\d{2}-\d{3}$/;
    expect(invoiceNo).toMatch(pattern);
  });
});

// ============================================================================
// FC-044: Form Validation
// ============================================================================

describe('UNIT-FC-044: Form Validation', () => {
  it('UNIT-FC-044-001: Should validate invoice number format', () => {
    const result = validateInvoiceNumber('SMI-2025-01-001');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('UNIT-FC-044-002: Should reject missing invoice number', () => {
    const result = validateInvoiceNumber('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('UNIT-FC-044-003: Should reject invalid format', () => {
    const result = validateInvoiceNumber('INVALID-FORMAT');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('format');
  });
});

// ============================================================================
// Tax & Currency Formatting
// ============================================================================

describe('UNIT-FC-021: Tax Calculation', () => {
  it('Should calculate 5% tax on 1000', () => {
    const tax = calculateTax(1000, 0.05);
    expect(tax).toBe(50);
  });

  it('Should round tax to 2 decimals', () => {
    const tax = calculateTax(33.33, 0.05);
    expect(tax).toBe(1.67);
  });
});

describe('UNIT-FC-022: Currency Formatting', () => {
  it('Should format 1234.5 as "1234.50"', () => {
    const formatted = formatCurrency(1234.5);
    expect(formatted).toBe('1234.50');
  });

  it('Should handle string input', () => {
    const formatted = formatCurrency('99.9');
    expect(formatted).toBe('99.90');
  });
});

// ============================================================================
// FC-032: Concurrency Detection (First-Write-Wins)
// ============================================================================

describe('UNIT-FC-032: First-Write-Wins Concurrency Detection', () => {
  it('Should detect matching invoice data (no concurrent update)', () => {
    const current = {
      invoiceNo: 'SMI-2025-01-001',
      items: [{ amount: 100 }],
      totalAmount: 100
    };
    const submitted = {
      invoiceNo: 'SMI-2025-01-001',
      items: [{ amount: 100 }],
      totalAmount: 100
    };
    const matches = invoiceDataMatches(current, submitted);
    expect(matches).toBe(true);
  });

  it('Should detect mismatched data (concurrent update detected)', () => {
    const current = {
      invoiceNo: 'SMI-2025-01-001',
      items: [{ amount: 100 }],
      totalAmount: 100
    };
    const submitted = {
      invoiceNo: 'SMI-2025-01-001',
      items: [{ amount: 200 }],  // Changed!
      totalAmount: 200
    };
    const matches = invoiceDataMatches(current, submitted);
    expect(matches).toBe(false);
  });
});
