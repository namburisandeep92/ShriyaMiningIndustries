import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { parsePendingOrders } from '../../api/services/pending-orders.js';
import {
  amountWords, applyCompanyProfileDefaults, buildLegacyPrintHtml, buildLegacyWorkbook, crateRanges, createLegacyInvoice, excelPreviewHtml,
  goodsCategories, invoiceTotal, lineAmount, parseItem, validHsnCode, validateLegacyInvoice,
} from '../../api/services/legacy-invoice.js';
import { legacyInvoiceInput } from '../../api/services/api-contracts.js';

const fixture = new URL('../fixtures/po/SHRIYA_MINING_INDUSTRIES_PendingOrders.xlsx', import.meta.url);
async function validDocument() {
  const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
  const document = createLegacyInvoice(po.rows.slice(0, 2));
  document.hsnCodes = Object.fromEntries(goodsCategories(document.lines).map(category =>
    [category, category === 'GRANITE TILES' ? '68022310' : '1234']));
  document.header['Invoice no'] = '2365';
  document.header['Crate starting no'] = '245';
  document.lines.forEach(line => { line.crates = 2; line.rate = 1.625; line.weight = 100; });
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

  it('cleans HSN values from case-insensitive Excel and CSV headings', async () => {
    const csv = await parsePendingOrders(Buffer.from('SPS Item,SKU,Qty,UOM,hSn / SaC\nGranite,G-1,2,SF,6802.23.10\nSlate,S-1,1,SF,6802 23 10'), 'hsn.csv');
    expect(csv.rows.map(row => row.hsnCode)).toEqual(['68022310', '68022310']);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('PO');
    sheet.addRow(['SPS Item', 'SKU', 'Qty', 'UOM', ' HSN Code ']);
    sheet.addRow(['Granite', 'G-1', 2, 'SF', '6802-23-10']);
    const xlsx = await workbook.xlsx.writeBuffer();
    const parsed = await parsePendingOrders(Buffer.from(xlsx), 'hsn.xlsx');
    expect(parsed.rows[0].hsnCode).toBe('68022310');
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
    expect(parseItem({ item: 'California Gold Gauged Slate Tile', sku: 'SLTCALGLD1212G' }).kind).toBe('SLATE STONE TILES');
    expect(parseItem({ item: 'Purbeck Grey Limestone Paver', sku: 'LIMPURGRY1624D' }).kind).toBe('LIMESTONE');
    expect(parseItem({ item: 'Sunwood Quartzite Display Board', sku: 'MKTSUNWOODB' }).kind).toBe('QUARTZITE');
    const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
    const initial = createLegacyInvoice([po.rows[0]]);
    expect(initial.lines[0]).toMatchObject({ qty: 250, uom: 'PC', rate: 0, size: '3/4" X 12"', ref: 'NSR PO # 172203 (GRNABSBLKLN34P)' });
    initial.lines[0].rate = 7;
    expect(createLegacyInvoice([po.rows[0], po.rows[1]], initial.lines).lines[0].rate).toBe(7);
    expect(createLegacyInvoice([po.rows[0]], [], {}, { categoryCodes: { 'GRANITE TILES': '6802.23.10' } }).hsnCodes['GRANITE TILES']).toBe('68022310');
    expect(initial.header['Buyer PO date']).toBe('2026-10-05');
  });

  it('requires one non-empty cleaned HSN code for each goods category', async () => {
    const document = await validDocument();
    expect(validHsnCode('68022310')).toBe(true);
    expect(validHsnCode('6802000')).toBe(true);
    expect(validHsnCode('6802.23.10')).toBe(true);
    expect(validHsnCode('letters and spaces')).toBe(false);
    expect(validateLegacyInvoice(document)).toEqual([]);
    document.hsnCodes['GRANITE TILES'] = 'letters and spaces';
    const issue = validateLegacyInvoice(document).find(item => item.field === 'hsn');
    expect(issue).toMatchObject({ category: 'GRANITE TILES', message: expect.stringContaining('HSN code is required') });
    document.hsnCodes['GRANITE TILES'] = '';
    expect(validateLegacyInvoice(document).some(item => item.field === 'hsn' && item.category === 'GRANITE TILES')).toBe(true);
    document.lines[0].hsnCode = '68022310';
    expect(validateLegacyInvoice(document).some(item => item.field === 'hsn' && item.category === 'GRANITE TILES')).toBe(true);
  });

  it('prefills and validates one remembered code per category', async () => {
    const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
    const rows = [po.rows[0], po.rows[4]];
    const document = createLegacyInvoice(rows, [], {}, {
      categoryCodes: { 'GRANITE TILES': '6802.23.10', 'SLATE STONE TILES': '680300' },
    });
    expect(document.hsnCodes).toMatchObject({ 'GRANITE TILES': '68022310', 'SLATE STONE TILES': '680300' });
    document.header['Invoice no'] = '2368';
    document.lines.forEach(line => { line.crates = 1; line.rate = 1.625; });
    crateRanges(document.lines, document.header['Crate starting no']).forEach((range, index) => { document.lines[index].crt = range; });
    expect(validateLegacyInvoice(document)).toEqual([]);
    delete document.hsnCodes['SLATE STONE TILES'];
    expect(validateLegacyInvoice(document).filter(issue => issue.field === 'hsn').map(issue => issue.category))
      .toEqual(['SLATE STONE TILES']);
  });

  it.each([
    ['qty', '', true], ['qty', '1.5', true], ['qty', '-1', true], ['qty', '2', false],
    ['crates', '0', true], ['crates', '1.5', true], ['crates', '2', false],
    ['rate', '0', true], ['rate', '-1', true], ['rate', 'abc', true], ['rate', '1.625', false],
    ['rate', '1.1234567', true], ['weight', '', false], ['weight', '0', true], ['weight', '1.25', false],
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
    document.hsnCodes['GRANITE TILES'] = '6802.23.10';
    const stored = JSON.parse(legacyInvoiceInput(document).documentJson);
    expect(stored.hsnCodes['GRANITE TILES']).toBe('68022310');
    expect(stored.lines[0].hsnCode).toBeUndefined();
    document.lines[0].net = 100;
    document.lines[0].gross = 120;
    const migrated = JSON.parse(legacyInvoiceInput(document).documentJson);
    expect(migrated.lines[0]).toMatchObject({ weight: 100 });
    expect(migrated.lines[0].net).toBeUndefined();
    expect(migrated.lines[0].gross).toBeUndefined();
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

  it('snapshots company exporter, shipping defaults, declaration and signatory in both outputs', async () => {
    const document = applyCompanyProfileDefaults(await validDocument(), {
      legalName: 'SHRIYA MINING INDUSTRIES',
      addressLine1: 'S.NO: 1174/2B, ONGOLE ROAD',
      addressLine2: 'MARKAPUR - 523 316',
      addressLine3: 'PRAKASAM D.T. (A.P) INDIA.',
      countryOfOrigin: 'INDIA',
      preCarriageBy: 'BY ROAD',
      placeOfReceipt: 'CHENNAI',
      portOfLoading: 'CHENNAI',
      packing: 'WOODEN CRATES',
      grade: 'FIRST GRADE',
      declarationText: 'Declaration <verified>',
      authorisedSignatoryLabel: 'Export Manager',
    });
    expect(document.header.Exporter).toBe('SHRIYA MINING INDUSTRIES\nS.NO: 1174/2B, ONGOLE ROAD\nMARKAPUR - 523 316\nPRAKASAM D.T. (A.P) INDIA.');
    expect(document.header['Country of origin']).toBe('INDIA');

    const print = buildLegacyPrintHtml(document, '2365');
    expect(print).toContain('Declaration &lt;verified&gt;');
    expect(print).toContain('For SHRIYA MINING INDUSTRIES');
    expect(print).toContain('Export Manager');
    const workbook = await buildLegacyWorkbook(document);
    for (const sheet of workbook.worksheets) {
      const text = sheet.getSheetValues().flat().map(value => typeof value === 'object' ? JSON.stringify(value) : value).join(' ');
      expect(text).toContain('Declaration <verified>');
      expect(text).toContain('Export Manager');
    }
  });

  it('writes INV and PACKING sheets with crate totals, per-line counts, HSN headings, and no packing amounts', async () => {
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
      expect(sheet.getColumn(3).values).toContain('04 NOS');
      expect(sheet.getColumn(2).values).toContain('02 CRATES');
      const text = sheet.getSheetValues().flat().map(value => typeof value === 'object' ? JSON.stringify(value) : value).join(' ');
      expect(text).toContain('HSN CODE 68022310');
      expect(text).toContain('CRT NO');
      expect(text).toContain('245 - 246');
      expect(text).toContain('Authorised Signatory');
      if (sheet.name === 'INV') {
        expect(sheet.getCell(row, 8).value).toBe(1.625);
        expect(sheet.getCell(row, 9).value).toBe(406.25);
      } else {
        expect(sheet.getCell(row, 8).value).toBeNull();
        expect(sheet.getCell(row, 9).value).toBeNull();
        expect(text).toContain('TOTAL WEIGHT ; 200.000 KGS');
        expect(text).not.toContain('GROSS');
        expect(text).not.toContain('NET WEIGHT');
        expect(text).not.toContain('406.25');
      }
    }
  });

  it('prints one HSN heading per category in both documents', async () => {
    const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
    const document = createLegacyInvoice([po.rows[0], po.rows[4]]);
    document.header['Invoice no'] = '2366';
    document.hsnCodes = { 'GRANITE TILES': '6802.23.10', 'SLATE STONE TILES': '680300' };
    document.lines.forEach(line => { line.crates = 2; line.rate = 1.625; });
    crateRanges(document.lines, '245').forEach((range, index) => { document.lines[index].crt = range; });

    const workbook = await buildLegacyWorkbook(document);
    for (const sheet of workbook.worksheets) {
      const text = sheet.getSheetValues().flat().map(value => typeof value === 'object' ? JSON.stringify(value) : value).join(' ');
      expect(text).toContain('04 NOS');
      expect(text).toContain('02 CRATES');
      expect(sheet.getColumn(1).values.filter(value => value === 'GRANITE TILES  HSN CODE 68022310')).toHaveLength(1);
      expect(sheet.getColumn(1).values.filter(value => value === 'SLATE STONE TILES  HSN CODE 680300')).toHaveLength(1);
    }

    const print = buildLegacyPrintHtml(document, '2366');
    const packingPrint = print.split('<section class="pg">')[2];
    expect(print.match(/GRANITE TILES  HSN CODE 68022310/g)).toHaveLength(2);
    expect(print.match(/SLATE STONE TILES  HSN CODE 680300/g)).toHaveLength(2);
    expect(packingPrint).toContain('04 NOS');
    expect(packingPrint).toContain('02 CRATES');
    expect(packingPrint).not.toContain('Rate');
    expect(packingPrint).not.toContain('Amount');
  });

  it('uses exactly one cleaned HSN heading for every category', async () => {
    const po = await parsePendingOrders(await readFile(fixture), 'PendingOrders.xlsx');
    const document = createLegacyInvoice([po.rows[0], po.rows[2], po.rows[1], po.rows[4]]);
    document.header['Invoice no'] = '2367';
    document.hsnCodes = { 'GRANITE TILES': '6802.23.10', 'SLATE STONE TILES': '680300' };
    document.lines.forEach(line => { line.crates = 1; line.rate = 1.625; });
    crateRanges(document.lines, '245').forEach((range, index) => { document.lines[index].crt = range; });

    const workbook = await buildLegacyWorkbook(document);
    const invoiceText = workbook.worksheets[0].getColumn(1).values;
    expect(invoiceText.filter(value => value === 'GRANITE TILES  HSN CODE 68022310')).toHaveLength(1);
    expect(invoiceText.filter(value => String(value).includes('GRANITE TILES  HSN CODE'))).toHaveLength(1);
    expect(invoiceText.filter(value => value === 'SLATE STONE TILES  HSN CODE 680300')).toHaveLength(1);
    const html = buildLegacyPrintHtml(document, '2367');
    expect(html).toContain('GRANITE TILES  HSN CODE 68022310');
    expect((html.match(/GRANITE TILES  HSN CODE/g) || [])).toHaveLength(2);
    expect(html).toContain('SLATE STONE TILES  HSN CODE 680300');
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
    expect(print).toContain('GRANITE TILES  HSN CODE 68022310');
    expect(print).toContain('04 NOS');
    expect(print).toContain('02 CRATES');
    const packingPrint = print.split('<section class="pg">')[2];
    expect(packingPrint).not.toContain('Amount');
    expect(packingPrint).not.toContain('Rate');
    expect(packingPrint).not.toContain('USD');
    expect(packingPrint).not.toContain('1218.75');
    expect(packingPrint).toContain('TOTAL WEIGHT');
    expect(packingPrint).not.toContain('GROSS');
    expect(packingPrint).not.toContain('NET WEIGHT');
  });
});
