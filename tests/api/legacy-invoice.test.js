import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { parsePendingOrders } from '../../api/services/pending-orders.js';
import {
  amountWords, buildLegacyPrintHtml, buildLegacyWorkbook, crateRanges, createLegacyInvoice, excelPreviewHtml,
  invoiceTotal, lineAmount, parseItem, validateLegacyInvoice,
} from '../../api/services/legacy-invoice.js';
import { legacyInvoiceInput } from '../../api/services/api-contracts.js';

const fixture = new URL('../fixtures/po/SHRIYA_MINING_INDUSTRIES_PendingOrders.xlsx', import.meta.url);
async function validDocument() {
  const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
  const document = createLegacyInvoice(po.rows.slice(0, 2));
  document.header['Invoice no'] = '2365';
  document.header['Crate starting no'] = '245';
  document.lines.forEach(line => { line.crates = 2; line.rate = 1.625; line.net = 100; });
  crateRanges(document.lines, '245').forEach((range, index) => { document.lines[index].crt = range; });
  document.words = amountWords(invoiceTotal(document.lines));
  return document;
}

describe('Legacy PendingOrders invoice contracts', () => {
  it('recognises all 82 actual fixture rows and preserves all eleven source columns', async () => {
    const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
    expect(po.columns).toEqual(['SPS Item', 'SKU', 'Supplier', 'PO#', 'PO Date', 'SO Ref#', 'Ship To Location', 'Qty', 'UOM', 'ETA', 'NOTES']);
    expect(po.rows).toHaveLength(82);
    expect(po.rows[0]).toMatchObject({ id: 0, qty: 250, uom: 'PC', po: '172203', date: '10/5/2026', sku: 'GRNABSBLKLN34P' });
    expect(new Set(po.rows.map(row => row.key)).size).toBe(82);
    expect(po.rows[0].raw['Ship To Location']).toBe('Anaheim');
  });

  it('accepts CSV, missing optional columns, duplicates and zero pending quantities like the legacy parser', async () => {
    const po = await parsePendingOrders(Buffer.from('SPS Item,Qty\nGranite,0\nGranite,0'), 'PendingOrders.csv');
    expect(po.rows).toHaveLength(2);
    expect(po.rows[0].key).not.toBe(po.rows[1].key);
    expect(po.rows[0].uom).toBe('');
  });

  it('defers invoice fields/columns until creation but rejects unreadable workbooks and unsupported .xls', async () => {
    const parsed = await parsePendingOrders(Buffer.from('Other,Qty\nx,1'), 'other.csv');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].item).toBe('');
    expect(validateLegacyInvoice(createLegacyInvoice(parsed.rows)).map(issue => issue.field)).toEqual(expect.arrayContaining(['Invoice no', 'rate', 'uom']));
    await expect(parsePendingOrders(Buffer.from('broken zip'), 'bad.xlsx')).rejects.toMatchObject({ statusCode: 400 });
    await expect(parsePendingOrders(Buffer.from('old binary'), 'old.xls')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('maps fractional-inch stone dimensions and source references, retaining edits when selection changes', async () => {
    expect(parseItem({ item: 'DAL - Absolute Black 12x24 Polished Granite' })).toMatchObject({
      code: 'DAL', stone: 'ABSOLUTE BLACK', size: '12" X 24"', finish: 'POLISHED', kind: 'GRANITE TILES',
    });
    const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
    const initial = createLegacyInvoice([po.rows[0]]);
    expect(initial.lines[0]).toMatchObject({ qty: 250, uom: 'PC', rate: 0, size: '3/4" X 12"', ref: 'NSR PO # 172203 (GRNABSBLKLN34P)' });
    initial.lines[0].rate = 7;
    expect(createLegacyInvoice([po.rows[0], po.rows[1]], initial.lines).lines[0].rate).toBe(7);
    expect(initial.header['Buyer PO date']).toBe('2026-10-05');
  });

  it.each([
    ['qty', '', true], ['qty', '1.5', true], ['qty', '-1', true], ['qty', '2', false],
    ['crates', '0', true], ['crates', '1.5', true], ['crates', '2', false],
    ['rate', '0', true], ['rate', '-1', true], ['rate', 'abc', true], ['rate', '1.625', false],
    ['rate', '1.1234567', true], ['net', '', false], ['net', '0', true], ['net', '1.25', false],
    ['uom', '', true],
  ])('validates %s = %s according to required/format rules', async (field, value, invalid) => {
    const document = await validDocument();
    document.lines[0][field] = value;
    expect(validateLegacyInvoice(document).some(issue => issue.field === field && issue.line === 0)).toBe(invalid);
  });

  it('blocks empty invoice/lines, impossible dates, invoice-number overflow and inconsistent crate ranges', async () => {
    const document = await validDocument();
    expect(validateLegacyInvoice(document)).toEqual([]);
    document.header['Invoice no'] = '';
    document.header['Invoice date'] = '2026-02-30';
    document.header['Crate starting no'] = '0';
    document.lines[0].crt = 'arbitrary';
    expect(validateLegacyInvoice(document).map(issue => issue.field)).toEqual(expect.arrayContaining(['Invoice no', 'Invoice date', 'Crate starting no', 'crt']));
    document.lines = [];
    expect(validateLegacyInvoice(document).some(issue => issue.field === 'lines')).toBe(true);
    expect(() => legacyInvoiceInput(document)).toThrow();
    document.header['Invoice no'] = '123456789012345678901';
    expect(validateLegacyInvoice(document).some(issue => issue.message.includes('20 characters'))).toBe(true);
  });

  it('calculates sequential crate ranges, rounded USD totals and amount words', async () => {
    const document = await validDocument();
    expect(document.lines.map(line => line.crt)).toEqual(['245 - 246', '247 - 248']);
    expect(crateRanges([{ crates: 1 }, { crates: 3 }], '9')).toEqual(['9', '10 - 12']);
    expect(invoiceTotal(document.lines)).toBe(1218.75);
    expect(document.words).toBe('USD ONE THOUSAND TWO HUNDRED EIGHTEEN AND CENTS SEVENTY FIVE ONLY');
    expect(legacyInvoiceInput(document)).toMatchObject({ requestedInvoiceNumber: '2365', items: [{ rate: 1.625, taxRate: 0 }, { rate: 1.625, taxRate: 0 }] });
    expect(lineAmount({ qty: 7, rate: 1.005 })).toBe(7.04);
    expect(lineAmount({ qty: 1, rate: 1.005 })).toBe(1.01);
  });

  it('defaults new invoices to crate 1001, recalculates counts, and preserves an edited start', async () => {
    const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
    const document = createLegacyInvoice(po.rows.slice(0, 2));
    expect(document.header['Crate starting no']).toBe('1001');
    document.lines[0].crates = 2;
    document.lines[1].crates = 3;
    expect(crateRanges(document.lines, document.header['Crate starting no'])).toEqual(['1001 - 1002', '1003 - 1005']);
    document.lines[0].crates = 1;
    expect(crateRanges(document.lines, '1001')).toEqual(['1001', '1002 - 1004']);
    expect(createLegacyInvoice(po.rows.slice(0, 2), document.lines, { 'Crate starting no': '700' }).header['Crate starting no']).toBe('700');
    expect(createLegacyInvoice(po.rows.slice(0, 2), document.lines, { 'Crate starting no': '' }).header['Crate starting no']).toBe('');
  });

  it('writes genuine INV/PACKING sheets with legacy layout, signatures, crates, UOM and corrected monetary cells', async () => {
    const document = await validDocument();
    const bytes = await (await buildLegacyWorkbook(document)).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['INV', 'PACKING']);
    for (const sheet of workbook.worksheets) {
      expect(sheet.columnCount).toBe(9);
      expect(sheet.pageSetup).toMatchObject({ paperSize: 9, orientation: 'portrait', fitToWidth: 1 });
      expect(sheet.getCell('A1').value).toBe('SHRIYA MINING INDUSTRIES');
      expect(sheet.getCell('A1').isMerged).toBe(true);
      const row = sheet.getColumn(7).values.findIndex(value => value === 250);
      expect(sheet.getCell(row, 7).numFmt).toContain('PC');
      expect(sheet.getCell(row, 8).value).toBe(100);
      expect(sheet.getCell(row, 9).value).toBe(406.25);
      const text = sheet.getSheetValues().flat().map(value => typeof value === 'object' ? JSON.stringify(value) : value).join(' ');
      expect(text).toContain('HSN CODE 68022310');
      expect(text).toContain('CRT NO  245 - 246');
      expect(text).toContain('Authorised Signatory');
    }
  });

  it('renders both preview formats, preserves edited words, escapes user content and suppresses mixed-UOM quantity totals', async () => {
    const document = await validDocument();
    document.header['Other reference'] = '<script>alert(1)</script>';
    document.words = 'CUSTOM WORDS';
    document.lines[1].uom = 'SF';
    const workbook = await buildLegacyWorkbook(document);
    const print = buildLegacyPrintHtml(document, '<unsafe>');
    const excel = excelPreviewHtml(workbook, '<unsafe>');
    for (const html of [print, excel]) {
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script');
      expect(html).toContain('CUSTOM WORDS');
      expect(html).not.toContain('750 PC');
    }
    expect((print.match(/<section class="pg">/g) || [])).toHaveLength(2);
    expect(print).toContain('PACKING LIST');
    expect(print).toContain('TOTAL WEIGHT');
  });
});
