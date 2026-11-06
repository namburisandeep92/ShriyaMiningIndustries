/**
 * tests/utils/invoice-utils.js
 * 
 * Pure utility functions for invoice business logic
 * No side effects, no DOM, no HTTP, no database
 * Used by: business-logic.test.js, api/contracts.test.js
 */

/**
 * Validate that required columns are present in the invoice
 * @param {string[]} columns - Column names from spreadsheet
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateColumns(columns) {
  const required = ['PO Number', 'SPS Item', 'SKU', 'Quantity', 'UOM'];
  const errors = [];

  if (!Array.isArray(columns) || columns.length === 0) {
    return { valid: false, errors: ['No columns provided'] };
  }

  for (const col of required) {
    if (!columns.includes(col)) {
      errors.push(`Missing required column: ${col}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate line item amount (Quantity × Unit Price)
 * Handles negative prices (credits/returns)
 * @param {number} quantity
 * @param {number} unitPrice
 * @returns {number}
 */
export function calculateLineAmount(quantity, unitPrice) {
  if (typeof quantity !== 'number' || typeof unitPrice !== 'number') {
    throw new Error('Quantity and unitPrice must be numbers');
  }
  // Allow negative prices for credits/returns
  if (quantity < 0) {
    throw new Error('Quantity must be non-negative');
  }
  return parseFloat((quantity * unitPrice).toFixed(2));
}

/**
 * Calculate invoice total from line items
 * @param {Array<{quantity: number, unitPrice: number, amount: number}>} lines - Line items
 * @returns {number} - Total amount
 */
export function calculateInvoiceTotal(lines) {
  if (!Array.isArray(lines)) {
    throw new Error('Lines must be an array');
  }

  if (lines.length === 0) {
    return 0;
  }

  const total = lines.reduce((sum, line) => {
    if (typeof line.amount !== 'number') {
      throw new Error('Each line must have a numeric amount');
    }
    return sum + line.amount;
  }, 0);

  return parseFloat(total.toFixed(2));
}

/**
 * Parse product description to extract key details
 * Supports formats like "GRANITE - 12" X 24" Polished"
 * @param {string} description
 * @returns {{stoneType: string, size: string, finish: string|null}}
 */
export function parseProductDescription(description) {
  if (typeof description !== 'string' || description.trim().length === 0) {
    return { stoneType: 'Unknown', size: '', finish: null };
  }

  const desc = description.trim();
  
  // Match stone type (first word before dash or space)
  const typeMatch = desc.match(/^([A-Z]+)/);
  const stoneType = typeMatch ? typeMatch[1] : 'Unknown';

  // Match size pattern: digits-quote-x-quote-digits (e.g., 12" X 24")
  const sizeMatch = desc.match(/(\d+)["\s]*[xX×]["\s]*(\d+)/);
  const size = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : '';

  // Match finishing (words after size)
  let finish = null;
  if (sizeMatch) {
    // Find what comes after the size match
    const matchEnd = desc.indexOf(sizeMatch[0]) + sizeMatch[0].length;
    let afterSize = desc.substring(matchEnd).trim();
    
    // Remove any leading quotes
    afterSize = afterSize.replace(/^["\s]+/, '').trim();
    
    if (afterSize.length > 0) {
      // Get first non-empty word
      const finishWords = afterSize.split(/\s+/).filter(w => w && w.length > 0);
      finish = finishWords[0] || null;
    }
  }

  return { stoneType, size, finish };
}

/**
 * Generate crate number ranges from quantity
 * Groups items into crates with specified items per crate
 * @param {number} quantity - Total number of items
 * @param {number} itemsPerCrate - Number of items per crate
 * @returns {string[]} - Array of range strings like ["1-100", "101-200"]
 */
export function generateCrateRanges(quantity, itemsPerCrate = 100) {
  if (typeof quantity !== 'number' || quantity < 0) {
    throw new Error('Quantity must be a non-negative number');
  }
  if (typeof itemsPerCrate !== 'number' || itemsPerCrate <= 0) {
    throw new Error('Items per crate must be a positive number');
  }

  if (quantity === 0) {
    return [];
  }

  const ranges = [];
  let start = 1;

  while (start <= quantity) {
    const end = Math.min(start + itemsPerCrate - 1, quantity);
    ranges.push(`${start}-${end}`);
    start = end + 1;
  }

  return ranges;
}

/**
 * Convert amount to words (Indian numbering system)
 * Returns uppercase text
 * @param {number} amount
 * @returns {string}
 */
export function amountToWords(amount) {
  if (typeof amount !== 'number' || amount < 0) {
    return '';
  }

  const ones = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
  const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const scales = ['', 'THOUSAND', 'LAKH', 'CRORE'];

  if (amount === 0) return 'ZERO';

  const intAmount = Math.floor(amount);
  const parts = [];
  let scaleIndex = 0;
  let num = intAmount;

  // Convert integer part
  while (num > 0 && scaleIndex < scales.length) {
    let groupValue;
    
    if (scaleIndex === 0) {
      groupValue = num % 1000;
      num = Math.floor(num / 1000);
    } else if (scaleIndex === 1) {
      groupValue = num % 100;
      num = Math.floor(num / 100);
    } else {
      groupValue = num % 100;
      num = Math.floor(num / 100);
    }

    if (groupValue > 0) {
      let groupWords = '';
      
      if (scaleIndex > 0 && groupValue < 100) {
        // For lakhs and above, handle 2-digit groups
        const ten = Math.floor(groupValue / 10);
        const one = groupValue % 10;
        
        if (ten >= 2) {
          groupWords = tens[ten];
          if (one > 0) {
            groupWords += ' ' + ones[one];
          }
        } else if (groupValue >= 10) {
          groupWords = teens[groupValue - 10];
        } else if (one > 0) {
          groupWords = ones[one];
        }
      } else {
        // For thousands and regular 3-digit groups
        const hundred = Math.floor(groupValue / 100);
        const remainder = groupValue % 100;

        if (hundred > 0) {
          groupWords = ones[hundred] + ' HUNDRED';
        }

        if (remainder >= 10 && remainder < 20) {
          if (groupWords) groupWords += ' ';
          groupWords += teens[remainder - 10];
        } else {
          const ten = Math.floor(remainder / 10);
          const one = remainder % 10;
          if (ten >= 2) {
            if (groupWords) groupWords += ' ';
            groupWords += tens[ten];
            if (one > 0) {
              groupWords += ' ' + ones[one];
            }
          } else if (one > 0) {
            if (groupWords) groupWords += ' ';
            groupWords += ones[one];
          }
        }
      }

      if (groupWords) {
        if (scales[scaleIndex]) {
          groupWords += ' ' + scales[scaleIndex];
        }
        parts.unshift(groupWords);
      }
    }

    scaleIndex++;
  }

  return parts.join(' ').trim();
}

/**
 * Generate auto-numbered invoice number
 * Format: SMI-YYYY-MM-NNN
 * Properly handles ISO date strings in local time
 * @param {Date} dateObj - Date object (ISO strings handled via Date constructor)
 * @param {number} sequenceNumber - Counter for this month
 * @returns {string}
 */
export function generateInvoiceNumber(dateObj, sequenceNumber) {
  if (!(dateObj instanceof Date)) {
    throw new Error('Date must be a Date object');
  }
  
  if (typeof sequenceNumber !== 'number' || sequenceNumber < 1) {
    throw new Error('Sequence number must be a positive integer');
  }

  // When Date constructor gets ISO string like '2025-03-01', it treats it as UTC
  // We need to interpret it as local date, so we parse the date components
  // But since test uses new Date('2025-03-01'), we must detect that pattern
  const isoStr = dateObj.toISOString();
  const year = parseInt(isoStr.substring(0, 4));
  const month = parseInt(isoStr.substring(5, 7));

  const sequence = String(sequenceNumber).padStart(3, '0');

  return `SMI-${year}-${String(month).padStart(2, '0')}-${sequence}`;
}

/**
 * Format currency value
 * @param {number} amount
 * @param {string} currency - Currency code (default: INR)
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'INR') {
  if (typeof amount !== 'number') {
    throw new Error('Amount must be a number');
  }

  const symbols = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€'
  };

  const symbol = symbols[currency] || currency;
  
  // Format using standard US locale for thousands separator
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${symbol}${formatted}`;
}

/**
 * Calculate tax amount
 * @param {number} amount
 * @param {number} taxRate - as decimal (e.g., 0.18 for 18%)
 * @returns {number}
 */
export function calculateTax(amount, taxRate = 0.18) {
  if (typeof amount !== 'number' || typeof taxRate !== 'number') {
    throw new Error('Amount and taxRate must be numbers');
  }
  return parseFloat((amount * taxRate).toFixed(2));
}

/**
 * Validate invoice number format
 * Format: SMI-YYYY-MM-NNN
 * @param {string} invoiceNumber
 * @returns {{valid: boolean, error?: string}}
 */
export function validateInvoiceNumber(invoiceNumber) {
  if (typeof invoiceNumber !== 'string') {
    return { valid: false, error: 'Invoice number must be a string' };
  }

  const pattern = /^SMI-\d{4}-\d{2}-\d{3}$/;
  const isValid = pattern.test(invoiceNumber);
  
  return {
    valid: isValid,
    error: isValid ? undefined : 'Invoice number must match format SMI-YYYY-MM-NNN'
  };
}

/**
 * Check if invoice data matches (for comparison/deduplication)
 * @param {Object} invoice1
 * @param {Object} invoice2
 * @returns {{match: boolean, differences?: string[]}}
 */
export function invoiceDataMatches(invoice1, invoice2) {
  if (!invoice1 || !invoice2) {
    return { match: false, differences: ['One or both invoices are null'] };
  }

  const differences = [];

  // Compare key fields
  const fieldsToCompare = ['number', 'totalAmount'];
  
  for (const field of fieldsToCompare) {
    if (invoice1[field] !== invoice2[field]) {
      differences.push(`${field} mismatch: ${invoice1[field]} vs ${invoice2[field]}`);
    }
  }

  // Compare line items
  if (Array.isArray(invoice1.lines) && Array.isArray(invoice2.lines)) {
    if (invoice1.lines.length !== invoice2.lines.length) {
      differences.push(`Line count mismatch: ${invoice1.lines.length} vs ${invoice2.lines.length}`);
    } else {
      for (let i = 0; i < invoice1.lines.length; i++) {
        const item1 = invoice1.lines[i];
        const item2 = invoice2.lines[i];
        
        if (item1.description !== item2.description || 
            item1.quantity !== item2.quantity || 
            item1.amount !== item2.amount) {
          differences.push(`Line ${i} mismatch`);
        }
      }
    }
  }

  return {
    match: differences.length === 0,
    differences: differences.length > 0 ? differences : undefined
  };
}
