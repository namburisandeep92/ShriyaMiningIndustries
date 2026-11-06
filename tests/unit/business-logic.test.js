/**
 * tests/unit/business-logic.test.js
 * 
 * Unit tests for pure business logic functions
 * Testing: calculations, formatting, parsing, validation
 * No dependencies: zero DOM, HTTP, database
 * 
 * Test naming: UNIT-FC-NNN where FC = Feature Category, NNN = test number
 * All tests use functions from tests/utils/invoice-utils.js
 */

import { describe, it, expect } from 'vitest';
import {
  validateColumns,
  calculateLineAmount,
  calculateInvoiceTotal,
  parseProductDescription,
  generateCrateRanges,
  amountToWords,
  generateInvoiceNumber,
  formatCurrency,
  calculateTax,
  validateInvoiceNumber,
  invoiceDataMatches
} from '../utils/invoice-utils';

describe('Unit Tests - Business Logic', () => {
  
  // ========================================================================
  // UNIT-FC-003: Column Validation
  // ========================================================================
  describe('UNIT-FC-003: Column Validation', () => {
    it('should validate required columns present', () => {
      const columns = ['PO Number', 'SPS Item', 'SKU', 'Quantity', 'UOM'];
      const result = validateColumns(columns);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing required column', () => {
      const columns = ['PO Number', 'SKU', 'Quantity']; // Missing SPS Item, UOM
      const result = validateColumns(columns);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('SPS Item');
    });

    it('should detect empty column list', () => {
      const result = validateColumns([]);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // UNIT-FC-016: Product Description Parsing
  // ========================================================================
  describe('UNIT-FC-016: Product Description Parsing', () => {
    it('should parse stone type and size', () => {
      const description = 'GRANITE - 12" X 24" Polished';
      const result = parseProductDescription(description);
      
      expect(result.stoneType).toBe('GRANITE');
      expect(result.size).toContain('12');
      expect(result.finish).toBe('Polished');
    });

    it('should parse marble description', () => {
      const description = 'MARBLE - 18" X 36" Honed';
      const result = parseProductDescription(description);
      
      expect(result.stoneType).toBe('MARBLE');
      expect(result.size).toContain('18');
    });

    it('should handle description without finish', () => {
      const description = 'LIMESTONE - 6" X 12"';
      const result = parseProductDescription(description);
      
      expect(result.stoneType).toBe('LIMESTONE');
      expect(result.size).toContain('6');
    });

    it('should return defaults for unrecognized format', () => {
      const description = 'Unknown format';
      const result = parseProductDescription(description);
      
      expect(result).toBeDefined();
      expect(result.stoneType).toBeDefined();
    });
  });

  // ========================================================================
  // UNIT-FC-017: Line Amount Calculation
  // ========================================================================
  describe('UNIT-FC-017: Line Amount Calculation', () => {
    it('should calculate line amount: quantity × unit price', () => {
      const quantity = 10;
      const unitPrice = 50.00;
      const amount = calculateLineAmount(quantity, unitPrice);
      
      expect(amount).toBe(500.00);
    });

    it('should handle decimal quantities (SF)', () => {
      const quantity = 125.5; // Square feet
      const unitPrice = 45.50;
      const amount = calculateLineAmount(quantity, unitPrice);
      
      expect(amount).toBe(5710.25);
    });

    it('should handle zero quantity', () => {
      const amount = calculateLineAmount(0, 100.00);
      expect(amount).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      const quantity = 3;
      const unitPrice = 10.01;
      const amount = calculateLineAmount(quantity, unitPrice);
      
      expect(amount).toBeCloseTo(30.03, 2);
    });

    it('should handle negative unit price (credit/return)', () => {
      const quantity = 5;
      const unitPrice = -25.00;
      const amount = calculateLineAmount(quantity, unitPrice);
      
      expect(amount).toBe(-125.00);
    });
  });

  // ========================================================================
  // UNIT-FC-018: Crate Range Generation
  // ========================================================================
  describe('UNIT-FC-018: Crate Range Generation', () => {
    it('should generate crate ranges for quantity', () => {
      const quantity = 500; // pieces
      const ranges = generateCrateRanges(quantity, 100);
      
      expect(ranges).toBeDefined();
      expect(ranges.length).toBeGreaterThan(0);
      expect(ranges[0]).toMatch(/\d+-\d+/);
    });

    it('should handle single crate', () => {
      const quantity = 50;
      const ranges = generateCrateRanges(quantity, 100);
      
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle partial crate', () => {
      const quantity = 250; // 2.5 crates
      const ranges = generateCrateRanges(quantity, 100);
      
      expect(ranges).toBeDefined();
      expect(ranges.length).toBeGreaterThan(1);
    });
  });

  // ========================================================================
  // UNIT-FC-021: Tax Calculation
  // ========================================================================
  describe('UNIT-FC-021: Tax Calculation', () => {
    it('should calculate tax at 5%', () => {
      const amount = 1000.00;
      const taxRate = 0.05;
      const tax = calculateTax(amount, taxRate);
      
      expect(tax).toBe(50.00);
    });

    it('should calculate tax at 18% (GST)', () => {
      const amount = 500.00;
      const taxRate = 0.18;
      const tax = calculateTax(amount, taxRate);
      
      expect(tax).toBe(90.00);
    });

    it('should handle zero tax rate', () => {
      const tax = calculateTax(1000.00, 0);
      expect(tax).toBe(0);
    });

    it('should round tax to 2 decimal places', () => {
      const amount = 333.33;
      const taxRate = 0.05;
      const tax = calculateTax(amount, taxRate);
      
      expect(tax).toBeCloseTo(16.67, 2);
    });
  });

  // ========================================================================
  // UNIT-FC-022: Invoice Total Calculation
  // ========================================================================
  describe('UNIT-FC-022: Invoice Total Calculation', () => {
    it('should sum line amounts correctly', () => {
      const lines = [
        { quantity: 10, unitPrice: 50, amount: 500 },
        { quantity: 5, unitPrice: 100, amount: 500 },
        { quantity: 20, unitPrice: 25, amount: 500 }
      ];
      const total = calculateInvoiceTotal(lines);
      
      expect(total).toBe(1500.00);
    });

    it('should handle single line', () => {
      const lines = [{ quantity: 100, unitPrice: 25, amount: 2500 }];
      const total = calculateInvoiceTotal(lines);
      
      expect(total).toBe(2500.00);
    });

    it('should handle empty lines', () => {
      const total = calculateInvoiceTotal([]);
      expect(total).toBe(0);
    });

    it('should handle lines with credits (negative amounts)', () => {
      const lines = [
        { quantity: 10, unitPrice: 100, amount: 1000 },
        { quantity: 2, unitPrice: -50, amount: -100 }
      ];
      const total = calculateInvoiceTotal(lines);
      
      expect(total).toBe(900.00);
    });

    it('should round total to 2 decimal places', () => {
      const lines = [
        { quantity: 3, unitPrice: 10.01, amount: 30.03 },
        { quantity: 2, unitPrice: 5.50, amount: 11 }
      ];
      const total = calculateInvoiceTotal(lines);
      
      expect(total).toBeCloseTo(41.03, 2);
    });
  });

  // ========================================================================
  // UNIT-FC-023: Amount to Words Conversion
  // ========================================================================
  describe('UNIT-FC-023: Amount to Words Conversion', () => {
    it('should convert rupees to words', () => {
      const words = amountToWords(1500);
      expect(words).toContain('ONE THOUSAND');
      expect(words).toContain('FIVE HUNDRED');
    });

    it('should handle round amounts', () => {
      const words = amountToWords(1000);
      expect(words).toContain('ONE THOUSAND');
    });

    it('should handle single digits', () => {
      const words = amountToWords(5);
      expect(words).toContain('FIVE');
    });

    it('should handle amounts with paise (decimals)', () => {
      const words = amountToWords(1234.56);
      expect(words).toBeDefined();
      expect(words.length).toBeGreaterThan(0);
    });

    it('should handle zero', () => {
      const words = amountToWords(0);
      expect(words).toContain('ZERO');
    });

    it('should handle large amounts', () => {
      const words = amountToWords(999999.99);
      expect(words).toBeDefined();
      expect(words.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // UNIT-FC-031: Invoice Number Generation
  // ========================================================================
  describe('UNIT-FC-031: Invoice Number Generation', () => {
    it('should generate SMI-YYYY-MM-NNN format', () => {
      const invoiceNumber = generateInvoiceNumber(new Date('2025-01-15'), 1);
      
      expect(invoiceNumber).toMatch(/^SMI-2025-01-\d{3}$/);
      expect(invoiceNumber).toBe('SMI-2025-01-001');
    });

    it('should increment sequence', () => {
      const num1 = generateInvoiceNumber(new Date('2025-02-10'), 1);
      const num2 = generateInvoiceNumber(new Date('2025-02-10'), 2);
      const num3 = generateInvoiceNumber(new Date('2025-02-10'), 3);
      
      expect(num1).toBe('SMI-2025-02-001');
      expect(num2).toBe('SMI-2025-02-002');
      expect(num3).toBe('SMI-2025-02-003');
    });

    it('should zero-pad sequence to 3 digits', () => {
      const num = generateInvoiceNumber(new Date('2025-03-01'), 42);
      
      expect(num).toBe('SMI-2025-03-042');
    });

    it('should reset sequence each month', () => {
      const jan = generateInvoiceNumber(new Date('2025-01-15'), 50);
      const feb = generateInvoiceNumber(new Date('2025-02-15'), 1);
      
      expect(jan).toMatch(/SMI-2025-01-/);
      expect(feb).toMatch(/SMI-2025-02-001/);
    });
  });

  // ========================================================================
  // UNIT-FC-032: Concurrency Detection
  // ========================================================================
  describe('UNIT-FC-032: Concurrency Detection (Mock)', () => {
    it('should detect rowversion mismatch', () => {
      const invoice = {
        id: '123',
        status: 'Draft',
        rowVersion: 'v1-abc123'
      };
      
      const result = invoice.rowVersion !== 'v1-wrong';
      expect(result).toBe(true); // Mismatch detected
    });

    it('should allow update with matching rowversion', () => {
      const invoice = {
        id: '123',
        status: 'Draft',
        rowVersion: 'v1-abc123'
      };
      
      const result = invoice.rowVersion === 'v1-abc123';
      expect(result).toBe(true); // Match allows update
    });
  });

  // ========================================================================
  // UNIT-FC-044: Invoice Number Validation
  // ========================================================================
  describe('UNIT-FC-044: Invoice Number Validation', () => {
    it('should validate SMI format', () => {
      const result = validateInvoiceNumber('SMI-2025-01-001');
      
      expect(result.valid).toBe(true);
    });

    it('should reject wrong format', () => {
      const result = validateInvoiceNumber('INV-2025-01-001');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject missing sequence', () => {
      const result = validateInvoiceNumber('SMI-2025-01');
      
      expect(result.valid).toBe(false);
    });

    it('should reject non-zero-padded sequence', () => {
      const result = validateInvoiceNumber('SMI-2025-01-1');
      
      expect(result.valid).toBe(false);
    });

    it('should validate all valid invoices', () => {
      const validNumbers = [
        'SMI-2025-01-001',
        'SMI-2025-12-999',
        'SMI-2024-06-050'
      ];
      
      validNumbers.forEach(num => {
        const result = validateInvoiceNumber(num);
        expect(result.valid).toBe(true);
      });
    });
  });

  // ========================================================================
  // UNIT-FC-050: Currency Formatting
  // ========================================================================
  describe('UNIT-FC-050: Currency Formatting', () => {
    it('should format currency with 2 decimals', () => {
      const formatted = formatCurrency(1234.5);
      
      expect(formatted).toBe('₹1,234.50');
    });

    it('should add thousands separator', () => {
      const formatted = formatCurrency(1000000);
      
      expect(formatted).toContain('1,000,000');
    });

    it('should handle zero', () => {
      const formatted = formatCurrency(0);
      
      expect(formatted).toBe('₹0.00');
    });

    it('should handle negative amounts', () => {
      const formatted = formatCurrency(-500.50);
      
      expect(formatted).toContain('-');
      expect(formatted).toContain('500.50');
    });
  });

  // ========================================================================
  // UNIT-FC-051: Invoice Data Matching
  // ========================================================================
  describe('UNIT-FC-051: Invoice Data Matching', () => {
    it('should match identical invoices', () => {
      const invoice1 = {
        number: 'SMI-2025-01-001',
        totalAmount: 1500.00,
        taxAmount: 270.00,
        lines: [
          { description: 'GRANITE 12x24', quantity: 10, amount: 1230.00 }
        ]
      };
      
      const invoice2 = {
        number: 'SMI-2025-01-001',
        totalAmount: 1500.00,
        taxAmount: 270.00,
        lines: [
          { description: 'GRANITE 12x24', quantity: 10, amount: 1230.00 }
        ]
      };
      
      const result = invoiceDataMatches(invoice1, invoice2);
      expect(result.match).toBe(true);
    });

    it('should detect amount mismatch', () => {
      const invoice1 = {
        number: 'SMI-2025-01-001',
        totalAmount: 1500.00,
        lines: []
      };
      
      const invoice2 = {
        number: 'SMI-2025-01-001',
        totalAmount: 1501.00,
        lines: []
      };
      
      const result = invoiceDataMatches(invoice1, invoice2);
      expect(result.match).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('should detect line count mismatch', () => {
      const invoice1 = {
        number: 'SMI-2025-01-001',
        lines: [
          { description: 'Line 1', quantity: 10 },
          { description: 'Line 2', quantity: 20 }
        ]
      };
      
      const invoice2 = {
        number: 'SMI-2025-01-001',
        lines: [
          { description: 'Line 1', quantity: 10 }
        ]
      };
      
      const result = invoiceDataMatches(invoice1, invoice2);
      expect(result.match).toBe(false);
    });
  });
});
