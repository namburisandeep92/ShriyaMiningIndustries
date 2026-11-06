/**
 * Utility functions extracted from legacy Invoice_Generator.html
 * These are pure functions with no DOM dependencies
 * Used by all test layers (Unit, API, Output)
 */

/**
 * Validate required columns exist in parsed data
 * @param {Array<Object>} rows - Parsed Excel rows
 * @param {Array<string>} requiredColumns - Column names required
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateColumns(rows, requiredColumns = []) {
  const errors = [];

  if (!rows || rows.length === 0) {
    errors.push('No data rows found in file');
    return { valid: false, errors };
  }

  const firstRow = rows[0];
  const missingColumns = requiredColumns.filter(col => !(col in firstRow));

  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate line amount (quantity × rate)
 * @param {number} qty - Quantity
 * @param {number} rate - Unit rate
 * @returns {number} - Amount rounded to 2 decimals
 */
export function calculateLineAmount(qty, rate) {
  const amount = qty * rate;
  return Math.round(amount * 100) / 100;
}

/**
 * Calculate invoice total from line items
 * @param {Array<Object>} lines - Line items with 'amount' property
 * @returns {number} - Total rounded to 2 decimals
 */
export function calculateInvoiceTotal(lines) {
  if (!Array.isArray(lines)) return 0;
  const total = lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Parse product description to extract stone, finish, size
 * Example: "GRANITE - 12\" X 24\" Polished" → { stone: "GRANITE", size: "12\" X 24\"", finish: "Polished" }
 * @param {string} description - Product description
 * @returns {Object} - { stone, size, finish }
 */
export function parseProductDescription(description) {
  const result = { stone: '', size: '', finish: '' };

  if (!description) return result;

  // Split by dash to separate stone name from rest
  const parts = description.split(' - ');
  result.stone = parts[0]?.trim() || '';

  if (parts.length < 2) return result;

  const remaining = parts.slice(1).join(' - ').trim();

  // Try to extract dimensions (e.g., "12\" X 24\"")
  const dimMatch = remaining.match(/(\d+(?:\s*\d+\/\d+)?(?:\s*[″"])?(?:\s+[Xx]\s+)?)+/);
  if (dimMatch) {
    result.size = dimMatch[0].trim();
  }

  // Extract finish (last word if not a dimension)
  const words = remaining.split(/\s+/);
  const lastWord = words[words.length - 1];
  if (lastWord && !lastWord.match(/^(\d|[″"]|[Xx])/)) {
    result.finish = lastWord;
  }

  return result;
}

/**
 * Generate crate ranges from start number and per-line crate counts
 * Example: start=100, crates=[3, 2, 1] → ["100-102", "103-104", "105"]
 * @param {number} startNum - Starting crate number
 * @param {Array<number>} crateCounts - Array of crate counts per line
 * @returns {Array<string>} - Array of crate ranges
 */
export function generateCrateRanges(startNum, crateCounts) {
  const ranges = [];
  let current = startNum;

  for (const count of crateCounts) {
    if (!count || count === 0) continue;

    const end = current + count - 1;
    if (current === end) {
      ranges.push(String(current));
    } else {
      ranges.push(`${current}-${end}`);
    }
    current = end + 1;
  }

  return ranges;
}

/**
 * Convert amount to words for invoice
 * Example: 1234.56 → "ONE THOUSAND TWO HUNDRED THIRTY-FOUR AND CENTS FIFTY-SIX ONLY"
 * @param {number} amount - Amount in currency
 * @returns {string} - Amount in words
 */
export function amountToWords(amount) {
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
  const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const scales = ['', 'THOUSAND', 'MILLION', 'BILLION', 'TRILLION'];

  if (amount === 0) return 'ZERO';
  if (amount < 0) return 'NEGATIVE ' + amountToWords(-amount);

  const [intPart, decPart] = amount.toString().split('.');
  let integerPart = parseInt(intPart);
  const decimal = parseInt((decPart || '').padEnd(2, '0').slice(0, 2));

  function convertHundreds(num) {
    let words = '';

    const hundreds = Math.floor(num / 100);
    if (hundreds > 0) {
      words += ones[hundreds] + ' HUNDRED ';
    }

    const remainder = num % 100;
    if (remainder >= 20) {
      const ten = Math.floor(remainder / 10);
      const one = remainder % 10;
      words += tens[ten] + (one > 0 ? ' ' + ones[one] : '');
    } else if (remainder >= 10) {
      words += teens[remainder - 10];
    } else if (remainder > 0) {
      words += ones[remainder];
    }

    return words.trim();
  }

  let words = '';
  let scale = 0;

  while (integerPart > 0 && scale < scales.length) {
    const chunk = integerPart % 1000;
    if (chunk > 0) {
      words = convertHundreds(chunk) + (scales[scale] ? ' ' + scales[scale] : '') + (words ? ' ' + words : '');
    }
    integerPart = Math.floor(integerPart / 1000);
    scale++;
  }

  words = words.trim();
  if (words === '') words = 'ZERO';
  
  if (decimal > 0) {
    words += ' AND CENTS ' + convertHundreds(decimal);
  }
  words += ' ONLY';

  return words.replace(/\s+/g, ' ').trim();
}

/**
 * Generate invoice number in format SMI-YYYY-MM-{seq}
 * @param {Date} date - Invoice date
 * @param {number} sequence - Sequence number for the month
 * @returns {string} - Invoice number (e.g., SMI-2025-01-001)
 */
export function generateInvoiceNumber(date = new Date(), sequence = 1) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `SMI-${year}-${month}-${seq}`;
}

/**
 * Format currency value to string with 2 decimals
 * @param {number} value - Value to format
 * @returns {string} - Formatted value (e.g., "1234.56")
 */
export function formatCurrency(value) {
  if (typeof value !== 'number') {
    value = parseFloat(value) || 0;
  }
  return value.toFixed(2);
}

/**
 * Calculate tax amount
 * @param {number} amount - Base amount
 * @param {number} taxRate - Tax rate as decimal (e.g., 0.05 for 5%)
 * @returns {number} - Tax amount rounded to 2 decimals
 */
export function calculateTax(amount, taxRate = 0) {
  const tax = amount * taxRate;
  return Math.round(tax * 100) / 100;
}

/**
 * Validate invoice number format
 * @param {string} invoiceNo - Invoice number to validate
 * @returns {Object} - { valid: boolean, error: string | null }
 */
export function validateInvoiceNumber(invoiceNo) {
  if (!invoiceNo) {
    return { valid: false, error: 'Invoice number is required' };
  }

  const pattern = /^SMI-\d{4}-\d{2}-\d{3}$/;
  if (!pattern.test(invoiceNo)) {
    return { valid: false, error: 'Invoice number must match format: SMI-YYYY-MM-NNN' };
  }

  return { valid: true, error: null };
}

/**
 * Check if two invoice data objects are equivalent
 * Used for first-write-wins concurrency detection
 * @param {Object} current - Current invoice data
 * @param {Object} submitted - Data submitted for update
 * @returns {boolean} - True if data matches (no concurrent modification)
 */
export function invoiceDataMatches(current, submitted) {
  if (!current || !submitted) return false;
  // Compare key fields, ignore timestamps and version
  return (
    current.invoiceNo === submitted.invoiceNo &&
    JSON.stringify(current.items) === JSON.stringify(submitted.items) &&
    current.totalAmount === submitted.totalAmount
  );
}
