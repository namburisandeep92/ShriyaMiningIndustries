import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { Errors } from '../middleware/error-handler.js';

function display(value) {
  if (value == null) return '';
  if (value instanceof Date) {
    const date = new Date(value.getTime() + 432e5);
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
  }
  if (typeof value === 'object') {
    if ('result' in value) return display(value.result);
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('text' in value) return String(value.text);
    throw Errors.InvalidExcelFormat('Unsupported cell value in PO file');
  }
  return String(value).replace(/ 12:00:00 AM$/, '');
}

export async function parsePendingOrders(buffer, fileName) {
  if (!/\.(xlsx|csv)$/i.test(fileName)) throw Errors.InvalidExcelFormat('Use an .xlsx or .csv PendingOrders file; convert .xls to .xlsx first');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw Errors.InvalidInput('PO file must be between 1 byte and 10 MB');
  const workbook = new ExcelJS.Workbook();
  try {
    if (/\.csv$/i.test(fileName)) await workbook.csv.read(Readable.from([buffer]));
    else await workbook.xlsx.load(buffer);
  } catch (error) {
    console.error('[PendingOrders] Workbook parsing failed:', error.message);
    throw Errors.InvalidExcelFormat('Unable to read the PO workbook');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Errors.InvalidExcelFormat('No worksheet found');
  const columns = [];
  sheet.getRow(1).eachCell((cell, index) => { columns.push({ name: display(cell.value), index }); });
  if (!columns.length) throw Errors.InvalidExcelFormat('The PO file has no readable headings');
  if (new Set(columns.map(column => column.name)).size !== columns.length) throw Errors.InvalidExcelFormat('PO headings must be unique');
  const rows = [];
  const occurrences = new Map();
  sheet.eachRow((row, index) => {
    if (index === 1 || !row.hasValues) return;
    const raw = Object.fromEntries(columns.map(column => [column.name, display(row.getCell(column.index).value)]));
    const qty = parseFloat(raw.Qty) || 0;
    const base = [raw['PO#'] || '', raw.SKU || '', raw['SO Ref#'] || '', qty].join('|');
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    rows.push({
      id: rows.length, key: `${base}#${occurrence}`, raw,
      all: Object.values(raw).join(' ').toLowerCase(), item: raw['SPS Item'] || '', sku: raw.SKU || '',
      po: raw['PO#'] || '', date: raw['PO Date'] || '', so: raw['SO Ref#'] || '', qty, uom: raw.UOM || '',
    });
  });
  if (!rows.length) throw Errors.InvalidInput('No PO lines found');
  if (rows.length > 10000) throw Errors.InvalidInput('PO file must not exceed 10,000 lines');
  return { fileName, columns: columns.map(column => column.name), rows, itemsCount: rows.length };
}
