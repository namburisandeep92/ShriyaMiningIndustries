import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { crateRanges, createLegacyInvoice, goodsCategories, invoiceTotal } from '../../api/services/legacy-invoice.js';

const enabled = process.env.SMI_LIVE_DB_TEST === 'test';

describe.skipIf(!enabled)('Platform contracts against guarded test SQL', () => {
  let db, server, base, vendorId, buyerId, invoice, importId, createdUserId, adminId, errorLogId, originalRoles;
  const legacyIds = new Set();
  const marker = `contract-${randomUUID()}`;
  const adminEmail = `${marker}@example.invalid`;
  const userEmail = `viewer-${marker}@example.invalid`;
  const principal = email => Buffer.from(JSON.stringify({ userDetails: email, userRoles: ['authenticated'] })).toString('base64');

  async function call(path, method = 'GET', body, email = adminEmail) {
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { 'x-ms-client-principal': principal(email), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }

  async function apply(name) {
    const source = await readFile(new URL(`../../database/migrations/${name}`, import.meta.url), 'utf8');
    for (const batch of source.split(/^\s*GO\s*$/gmi).filter(value => value.trim())) await db.query(batch);
  }

  beforeAll(async () => {
    process.loadEnvFile();
    if (process.env.DB_TEST_NAME !== 'shriyaminingdbtest') throw new Error('Test catalog guard failed');
    process.env.ENVIRONMENT = 'test';
    process.env.NODE_ENV = 'production';
    delete process.env.DB_CONNECTION_STRING;
    process.env.DB_SERVER = process.env.DB_TEST_HOST;
    process.env.DB_DATABASE = process.env.DB_TEST_NAME;
    process.env.DB_USERNAME = process.env.DB_TEST_USER;
    process.env.DB_PASSWORD = process.env.DB_TEST_PASSWORD;
    const { getDatabase } = await import('../../api/services/database.js');
    db = getDatabase();
    await db.connect(1);
    expect((await db.query('SELECT DB_NAME() db'))[0].db).toBe('shriyaminingdbtest');
    originalRoles = await db.query('SELECT RoleId,RoleName FROM security.Role ORDER BY RoleId');
    await apply('V004__api-contract-data.sql');
    await apply('V005__legacy-invoice-document.sql');
    await apply('R__platform-procedures.sql');
    const admin = await db.execute('security.usp_User_Create', {
      email: adminEmail, name: marker, createdByEmail: marker, rolesJson: '["Admin"]',
    });
    adminId = admin.recordset[0].UserId;
    vendorId = (await db.query('INSERT app.Vendor(VendorCode,VendorName) OUTPUT inserted.VendorId VALUES(@marker,@marker)', { marker }))[0].VendorId;
    buyerId = (await db.query('INSERT app.Buyer(BuyerCode,BuyerName) OUTPUT inserted.BuyerId VALUES(@marker,@marker)', { marker }))[0].BuyerId;
    errorLogId = (await db.query(`INSERT log.ErrorLog(CorrelationId,Layer,SqlMessage,RequestPath,CreatedBy)
      OUTPUT inserted.ErrorLogId VALUES(NEWID(),'API',@marker,'/api/fixture',@marker)`, { marker }))[0].ErrorLogId;
    const { createApp } = await import('../../api/server.js');
    const app = await createApp();
    server = await new Promise(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    base = `http://127.0.0.1:${server.address().port}`;
    expect((await call('/health')).data.status).toBe('healthy');
    expect((await call('/health')).data).toMatchObject({ environment: 'test', databaseName: 'shriyaminingdbtest' });
  }, 120000);

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    if (db?.pool) {
      for (const id of [invoice?.id, ...legacyIds].filter(Boolean)) {
        for (const table of ['InvoiceSnapshot', 'InvoiceHistory', 'InvoiceLine', 'Invoice']) {
          await db.query(`DELETE app.${table} WHERE InvoiceId=@id`, { id });
        }
      }
      if (importId) {
        await db.query('DELETE sales.POLine WHERE POImportBatchId=@id; DELETE sales.POImportBatch WHERE POImportBatchId=@id', { id: importId });
      }
      if (vendorId) await db.query('DELETE app.Vendor WHERE VendorId=@id', { id: vendorId });
      if (buyerId) await db.query('DELETE app.Buyer WHERE BuyerId=@id', { id: buyerId });
      if (errorLogId) await db.query('DELETE log.ErrorLog WHERE ErrorLogId=@id', { id: errorLogId });
      for (const id of [createdUserId, adminId].filter(Boolean)) {
        await db.query('DELETE security.UserRole WHERE UserId=@id; DELETE security.[User] WHERE UserId=@id', { id });
      }
      await db.close();
    }
  }, 60000);

  it('creates, filters and pages real invoices with separate header/line resultsets', async () => {
    const created = await call('/invoices', 'POST', {
      vendorId, buyerId, invoiceDate: '2026-01-02', poNumber: marker,
      lineItems: [{ description: marker, quantity: 2, unitPrice: 12.34, taxPercent: 18 }],
    });
    expect(created.status).toBe(201);
    invoice = created.data;
    expect(invoice).toMatchObject({ vendorId, buyerId, status: 'draft', version: 1,
      totals: { subtotal: 24.68, tax: 4.44, total: 29.12 } });
    expect(invoice.rowVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(invoice.lineItems).toHaveLength(1);
    const list = await call(`/invoices?search=${marker}&page=1&pageSize=1`);
    expect(list.status).toBe(200);
    expect(list.data.total).toBe(1);
    expect(list.data.invoices[0].id).toBe(invoice.id);
    const outside = await call(`/invoices?search=${marker}&page=2&pageSize=1`);
    expect(outside.data).toMatchObject({ invoices: [], total: 1 });
    expect((await call('/invoices?pageSize=0')).status).toBe(400);
    expect((await call('/master-data')).data.vendors.some(vendor => vendor.id === vendorId)).toBe(true);
  }, 60000);

  it('parses the real PendingOrders workbook and persists/export/reopens its complete selected invoice', async () => {
    const file = await readFile(new URL('../fixtures/po/SHRIYA_MINING_INDUSTRIES_PendingOrders.xlsx', import.meta.url));
    const parsed = await call('/po-import/parse', 'POST', { fileName: 'PendingOrders.xlsx', file: file.toString('base64') });
    expect(parsed.status).toBe(200);
    expect(parsed.data.rows).toHaveLength(82);
    expect((await call('/po-import/parse', 'POST', { fileName: 'PendingOrders.xlsx', file: file.toString('base64') }, userEmail)).status).toBe(403);
    const document = createLegacyInvoice(parsed.data.rows);
    document.hsnCodes = Object.fromEntries(goodsCategories(document.lines).map(category => [category, '12345678']));
    document.header['Invoice no'] = `L-${randomUUID().slice(0, 18)}`;
    document.header['Crate starting no'] = '245';
    document.lines.forEach(line => { line.rate = 1.234567; line.crates = 2; });
    crateRanges(document.lines, '245').forEach((range, index) => { document.lines[index].crt = range; });
    expect((await call('/invoices', 'POST', { vendorId, buyerId, document })).status).toBe(400);
    document.lines.forEach(line => { line.qty = Math.ceil(line.qty); });
    document.lines[0].qty = 7;
    document.lines[0].rate = 1.005;
    const created = await call('/invoices', 'POST', { vendorId, buyerId, document });
    expect(created.status).toBe(201);
    legacyIds.add(created.data.id);
    expect(created.data.document).toEqual(document);
    expect(created.data.poNumber).toBe(document.header['Buyer PO nos']);
    expect(created.data.invoiceNumber).toBe(document.header['Invoice no']);
    expect(created.data.totals.total).toBe(invoiceTotal(document.lines));
    expect(created.data.lineItems[0].unitPrice).toBe(1.005);
    expect(created.data.totals.total).toBe(invoiceTotal(document.lines));
    const id = created.data.id;
    expect((await call(`/invoices/${id}`)).data.document).toEqual(document);
    expect((await call(`/invoices/${id}/versions/1`)).data.document).toEqual(document);
    document.header['Port of discharge'] = 'NEW YORK';
    document.header['Invoice no'] = `E-${randomUUID().slice(0, 18)}`;
    document.header['Invoice date'] = '2026-12-01';
    const edited = await call(`/invoices/${id}`, 'PATCH', { document, rowVersion: created.data.rowVersion });
    expect(edited.status).toBe(200);
    expect(edited.data.document).toEqual(document);
    expect(edited.data.invoiceNumber).toBe(document.header['Invoice no']);
    expect(edited.data.invoiceDate.slice(0, 10)).toBe('2026-12-01');
    expect((await call(`/invoices/${id}`, 'PATCH', { document, rowVersion: created.data.rowVersion })).status).toBe(409);
    const comparison = await call(`/invoices/${id}/history/compare?v1=1&v2=2`);
    expect(comparison.data.changes.map(change => change.field)).toContain('document');
    const headers = { 'x-ms-client-principal': principal(adminEmail) };
    const excel = await fetch(`${base}/api/invoices/${id}/export?format=excel&version=1`, { headers });
    expect(excel.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()));
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['INV', 'PACKING']);
    const print = await fetch(`${base}/api/invoices/${id}/export?format=print`, { headers });
    expect(print.status).toBe(200);
    expect(await print.text()).toContain('NEW YORK');
    document.lines[0].rate = 0;
    expect((await call('/invoices', 'POST', { vendorId, buyerId, document })).status).toBe(400);
  }, 120000);

  it('updates atomically, rejects stale versions and retains historical line snapshots', async () => {
    const token = invoice.rowVersion;
    const updated = await call(`/invoices/${invoice.id}`, 'PATCH', {
      rowVersion: token, status: 'in review', notes: 'Updated',
      lineItems: [{ description: 'Changed line', quantity: 3, unitPrice: 10, taxPercent: 5 }],
    });
    expect(updated.status).toBe(200);
    invoice = updated.data;
    expect(invoice).toMatchObject({ version: 2, status: 'in review', totals: { subtotal: 30, tax: 1.5, total: 31.5 } });
    expect((await call(`/invoices/${invoice.id}`, 'PATCH', { rowVersion: token, notes: 'stale' })).status).toBe(409);
    expect((await call(`/invoices/${invoice.id}`, 'PATCH', { rowVersion: invoice.rowVersion, status: 'shipped' })).status).toBe(400);
    const history = await call(`/invoices/${invoice.id}/history`);
    expect(history.data.versions.map(value => value.version)).toEqual([2, 1]);
    const original = await call(`/invoices/${invoice.id}/versions/1`);
    expect(original.data.lineItems[0].description).toBe(marker);
    expect(original.data.totals.total).toBe(29.12);
    expect((await call(`/invoices/${invoice.id}/versions/99`)).status).toBe(404);
    const comparison = await call(`/invoices/${invoice.id}/history/compare?v1=1&v2=2`);
    expect(comparison.data.changes.map(value => value.field)).toContain('lineItems');
    const cleared = await call(`/invoices/${invoice.id}`, 'PATCH', { rowVersion: invoice.rowVersion, notes: '' });
    expect(cleared.status).toBe(200);
    invoice = cleared.data;
    expect(invoice.notes).toBe('');
  }, 60000);

  it('returns genuine PDF and Excel binaries', async () => {
    const headers = { 'x-ms-client-principal': principal(adminEmail) };
    for (const [format, prefix] of [['pdf', '%PDF-'], ['excel', 'PK']]) {
      const response = await fetch(`${base}/api/invoices/${invoice.id}/export?format=${format}`, { headers });
      expect(response.status).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(0, prefix.length).toString()).toBe(prefix);
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes);
        expect(workbook.worksheets[0].getCell('B4').value).toBe('Changed line');
      }
    }
  }, 60000);

  it('reads uploads without invoice validation or creating a batch, preserving historical import listing', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('PO');
    sheet.addRow(['Line Number', 'Product Code', 'Description', 'Quantity', 'Unit Rate', 'Tax Rate']);
    sheet.addRow([1, 'PRODUCT-A', marker, 3, 12.34, 18]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
    const imported = await call('/po-import', 'POST', { vendorId, poNumber: marker, fileName: 'fixture.xlsx', file });
    expect(imported.status).toBe(200);
    expect(imported.data.itemsCount).toBe(1);
    expect(imported.data.rows[0].raw['Product Code']).toBe('PRODUCT-A');
    expect(imported.data.rows[0].raw['Unit Rate']).toBe('12.34');
    const batches = await call(`/po-import?vendorId=${vendorId}`);
    expect(batches.status).toBe(200);
    expect(batches.data.imports).toEqual([]);
    sheet.addRow([2, 'PRODUCT-B', 'Invalid', -1, 10, 0]);
    const invalid = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
    expect((await call('/po-import', 'POST', { fileName: 'fixture.xlsx', file: invalid })).status).toBe(200);
    expect((await db.query('SELECT COUNT(*) n FROM sales.POImportBatch WHERE VendorId=@id', { id: vendorId }))[0].n).toBe(0);
  }, 60000);

  it.skipIf(process.env.SMI_BROWSER_TEST !== 'test')('runs upload/select/edit/validate/preview/download/reopen in a real browser and Test SQL', async () => {
    const { chromium } = await import('playwright');
    const { createServer } = await import('vite');
    const { fileURLToPath } = await import('node:url');
    const vite = await createServer({
      configFile: fileURLToPath(new URL('../../app/vite.config.ts', import.meta.url)),
      root: fileURLToPath(new URL('../../app', import.meta.url)),
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: base, changeOrigin: true } } },
    });
    let browser;
    try {
      await vite.listen();
      browser = await chromium.launch({ channel: process.env.SMI_BROWSER_CHANNEL || 'msedge', headless: true });
      const context = await browser.newContext({ extraHTTPHeaders: { 'x-ms-client-principal': principal(adminEmail) }, acceptDownloads: true });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
      await page.goto(`${origin}/po-import`);
      await page.getByLabel('PO file', { exact: true }).setInputFiles(fileURLToPath(new URL('../fixtures/po/SHRIYA_MINING_INDUSTRIES_PendingOrders.xlsx', import.meta.url)));
      await page.getByRole('heading', { name: 'Select PO lines' }).waitFor();
      expect(await page.locator('.po-table tbody tr').count()).toBe(82);
      expect(await page.locator('.error').count()).toBe(0);
      const frozenPO = await page.locator('.po-table').evaluate(async table => {
        const scroller = table.parentElement;
        const cells = table.querySelector('tbody tr').children;
        const before = [cells[0], cells[1], cells[2]].map(cell => cell.getBoundingClientRect().left);
        scroller.scrollLeft = 300;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const after = [cells[0], cells[1], cells[2]].map(cell => cell.getBoundingClientRect().left);
        const header = table.querySelector('thead tr').getBoundingClientRect().height;
        const filterTop = parseFloat(getComputedStyle(table.querySelector('thead tr:nth-child(2) th')).top);
        scroller.scrollLeft = 0;
        return { before, after, header, filterTop };
      });
      expect(Math.abs(frozenPO.after[0] - frozenPO.before[0])).toBeLessThan(1);
      expect(Math.abs(frozenPO.after[1] - frozenPO.before[1])).toBeLessThan(1);
      expect(frozenPO.before[2] - frozenPO.after[2]).toBeGreaterThan(100);
      expect(Math.abs(frozenPO.header - frozenPO.filterTop)).toBeLessThan(1);
      await page.getByPlaceholder('Search item, SKU, PO#...').fill('172203');
      const shown = await page.locator('.po-table tbody tr').count();
      expect(shown).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Select shown', exact: true }).click();
      expect(await page.locator('.po-table tbody input:checked').count()).toBe(shown);
      await page.getByRole('button', { name: 'Clear shown', exact: true }).click();
      await page.getByLabel('Select PO line 1', { exact: true }).check();
      await page.getByLabel('Select PO line 5', { exact: true }).check();
      await page.getByPlaceholder('Search item, SKU, PO#...').fill('172203');
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      expect(await page.locator('.po-table tbody input:checked').count()).toBe(2);
      await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
      await page.getByRole('heading', { name: 'Review & edit invoice' }).waitFor();
      expect(await page.locator('.line-table tbody tr').count()).toBe(2);
      const frozenLine = await page.locator('.line-table').evaluate(async table => {
        const scroller = table.parentElement;
        const cells = table.querySelector('tbody tr').children;
        const before = [cells[0], cells[1]].map(cell => cell.getBoundingClientRect().left);
        scroller.scrollLeft = 400;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const after = [cells[0], cells[1]].map(cell => cell.getBoundingClientRect().left);
        const referenceFrozen = cells[0].querySelectorAll('input').length === 2;
        scroller.scrollLeft = 0;
        return { before, after, referenceFrozen };
      });
      expect(frozenLine.referenceFrozen).toBe(true);
      expect(Math.abs(frozenLine.after[0] - frozenLine.before[0])).toBeLessThan(1);
      expect(frozenLine.before[1] - frozenLine.after[1]).toBeGreaterThan(100);
      expect(await page.getByLabel('Crate starting no', { exact: true }).inputValue()).toBe('1001');
      expect(await page.getByRole('button', { name: 'Preview', exact: true }).isDisabled()).toBe(true);
      expect(await page.getByRole('button', { name: 'Save & download', exact: true }).isDisabled()).toBe(true);
      await page.getByLabel('Invoice no', { exact: true }).fill(`B-${randomUUID().slice(0, 18)}`);
      for (let index = 1; index <= 2; index++) {
        await page.getByLabel(`Line ${index} Crate count`, { exact: true }).fill('2');
        await page.getByLabel(`Line ${index} Rate / UOM`, { exact: true }).fill('1.625');
      }
      expect(await page.getByLabel('Line 1 Crate range', { exact: true }).inputValue()).toBe('1001 - 1002');
      expect(await page.getByLabel('Line 2 Crate range', { exact: true }).inputValue()).toBe('1003 - 1004');
      await page.getByLabel('Line 1 Crate count', { exact: true }).fill('3');
      expect(await page.getByLabel('Line 2 Crate range', { exact: true }).inputValue()).toBe('1004 - 1005');
      await page.getByLabel('Line 1 Crate count', { exact: true }).fill('2');
      await page.getByLabel('Line 1 Qty', { exact: true }).fill('1.5');
      expect(await page.getByRole('button', { name: 'Preview', exact: true }).isDisabled()).toBe(true);
      expect(await page.getByLabel('Line 1 Qty', { exact: true }).getAttribute('aria-invalid')).toBe('true');
      await page.getByLabel('Line 1 Qty', { exact: true }).fill('250');
      await page.getByLabel('Port of discharge', { exact: true }).fill('NEW YORK');
      await page.getByLabel('Amount chargeable in words', { exact: true }).fill('CUSTOM WORDS');
      expect(await page.getByRole('button', { name: 'Preview', exact: true }).isDisabled()).toBe(true);
      expect(await page.getByLabel('GRANITE TILES HSN code', { exact: true }).getAttribute('aria-invalid')).toBe('true');
      await page.getByLabel('GRANITE TILES HSN code', { exact: true }).fill('68022310');
      expect(await page.getByRole('button', { name: 'Preview', exact: true }).isDisabled()).toBe(true);
      await page.getByLabel('SLATE STONE TILES HSN code', { exact: true }).fill('680300');
      expect(await page.getByRole('button', { name: 'Preview', exact: true }).isDisabled()).toBe(false);
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const previewFrame = page.frameLocator('iframe[title="Invoice and packing list preview"]');
      await previewFrame.getByRole('heading', { name: 'INV', exact: true }).waitFor();
      expect(await previewFrame.locator('body').textContent()).toContain('CUSTOM WORDS');
      expect(await previewFrame.locator('body').textContent()).toContain('GRANITE TILES  HSN CODE 68022310');
      expect(await previewFrame.locator('body').textContent()).toContain('SLATE STONE TILES  HSN CODE 680300');
      await page.getByLabel('Format', { exact: true }).selectOption('pdf');
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('iframe')?.getAttribute('srcdoc')?.includes('PACKING LIST'));
      const html = await page.locator('iframe[title="Invoice and packing list preview"]').getAttribute('srcdoc');
      expect(html).toContain('04 NOS');
      expect(html).toContain('02 CRATES');
      expect(html).toContain('GRANITE TILES  HSN CODE 68022310');
      expect(html).toContain('SLATE STONE TILES  HSN CODE 680300');
      const packingHtml = html.slice(html.indexOf('PACKING LIST'));
      expect(packingHtml).not.toContain('<th>Rate</th>');
      expect(packingHtml).not.toContain('<th>Amount</th>');
      const printPage = await context.newPage();
      await printPage.setContent(html);
      const pdf = await printPage.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || [])).toHaveLength(2);
      await printPage.close();
      await page.getByLabel('Format', { exact: true }).selectOption('excel');
      await page.getByLabel('Vendor', { exact: true }).selectOption(String(vendorId));
      await page.getByLabel('Buyer', { exact: true }).selectOption(String(buyerId));
      const createdResponse = page.waitForResponse(response => response.url().endsWith('/api/invoices') && response.request().method() === 'POST');
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Save & download', exact: true }).click();
      const response = await createdResponse;
      expect(response.status()).toBe(201);
      const created = await response.json();
      legacyIds.add(created.id);
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^Invoice_.*\.xlsx$/);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(await download.path());
      expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['INV', 'PACKING']);
      for (const sheet of workbook.worksheets) {
        const text = sheet.getSheetValues().flat().map(value => typeof value === 'object' ? JSON.stringify(value) : value).join(' ');
        expect(text).toContain('04 NOS');
        expect(text).toContain('02 CRATES');
        expect(text).toContain('HSN CODE 68022310');
        expect(text).toContain('HSN CODE 680300');
        if (sheet.name === 'PACKING') {
          expect(text).not.toContain('Rate');
          expect(text).not.toContain('Amount');
          expect(text).toContain('TOTAL GROSS WEIGHT');
          expect(text).toContain('TOTAL NET WEIGHT');
        }
      }
      expect(created.document.lines.map(line => line.crt)).toEqual(['1001 - 1002', '1003 - 1004']);
      expect(created.document.hsnCodes).toMatchObject({ 'GRANITE TILES': '68022310', 'SLATE STONE TILES': '680300' });
      expect(created.document.words).toBe('CUSTOM WORDS');
      await page.goto(`${origin}/invoices/${created.id}/edit`);
      await page.getByRole('heading', { name: 'Review & edit invoice' }).waitFor();
      expect(await page.getByLabel('Port of discharge', { exact: true }).inputValue()).toBe('NEW YORK');
      expect(await page.getByLabel('Line 1 Rate / UOM', { exact: true }).inputValue()).toBe('1.625');
      expect(await page.getByLabel('Amount chargeable in words', { exact: true }).inputValue()).toBe('CUSTOM WORDS');
      await page.getByLabel('Port of discharge', { exact: true }).fill('HOUSTON');
      const updating = page.waitForResponse(response => response.url().endsWith(`/api/invoices/${created.id}`) && response.request().method() === 'PATCH');
      const redownloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Save & download', exact: true }).click();
      const updated = await updating;
      expect(updated.status()).toBe(200);
      expect((await updated.json()).version).toBe(2);
      await redownloading;
      await page.goto(`${origin}/po-import?invoice=${created.id}`);
      await page.getByRole('heading', { name: 'Review & edit invoice' }).waitFor();
      expect(await page.getByLabel('Port of discharge', { exact: true }).inputValue()).toBe('HOUSTON');
      expect(await page.getByLabel('GRANITE TILES HSN code', { exact: true }).inputValue()).toBe('68022310');
      expect(await page.getByLabel('SLATE STONE TILES HSN code', { exact: true }).inputValue()).toBe('680300');
      expect(pageErrors).toEqual([]);
    } finally {
      if (browser) await browser.close();
      await vite.close();
    }
  }, 180000);

  it('creates users with atomic roles, enforces permissions, grants roles and deletes safely', async () => {
    const result = await call('/admin/users', 'POST', { email: userEmail, role: 'Viewer' });
    expect(result.status).toBe(201);
    createdUserId = result.data.id;
    expect(result.data.roles).toEqual(['Viewer']);
    expect((await call('/admin/users')).data.users.some(user => user.id === createdUserId)).toBe(true);
    expect((await call('/invoices', 'GET', undefined, userEmail)).status).toBe(200);
    expect((await call('/admin/users', 'GET', undefined, userEmail)).status).toBe(403);
    expect((await call(`/invoices/${invoice.id}`, 'PATCH', { rowVersion: invoice.rowVersion }, userEmail)).status).toBe(403);
    const assigned = { userId: createdUserId, roleName: 'User', grantedBy: marker };
    await db.execute('security.usp_User_AssignRole', assigned);
    await db.execute('security.usp_User_AssignRole', assigned);
    expect((await db.query('SELECT COUNT(*) n FROM security.UserRole WHERE UserId=@id AND IsDeleted=0', { id: createdUserId }))[0].n).toBe(2);
    expect((await call('/admin/users', 'POST', { email: userEmail, role: 'Viewer' })).status).toBe(409);
    expect((await call('/admin/error-log?page=999999&pageSize=10')).data.errors).toEqual([]);
    const errors = await call(`/admin/error-log?search=${marker}`);
    expect(errors.data.errors[0]).toMatchObject({ id: errorLogId, message: marker, endpoint: '/api/fixture' });
    expect((await call('/admin/roles')).data.roles.length).toBe(originalRoles.length);
    expect((await call(`/admin/users/${adminId}`, 'DELETE')).status).toBe(400);
    expect((await call(`/admin/users/${createdUserId}`, 'DELETE')).status).toBe(204);
    expect((await call('/invoices', 'GET', undefined, userEmail)).status).toBe(403);
  }, 60000);

  it('preserves invoices and roles on repeated schema/procedure deployment, then soft-deletes', async () => {
    const token = invoice.rowVersion;
    await apply('V001__schemas.sql');
    await apply('V004__api-contract-data.sql');
    await apply('R__platform-procedures.sql');
    expect(await db.query('SELECT RoleId,RoleName FROM security.Role ORDER BY RoleId')).toEqual(originalRoles);
    const current = await call(`/invoices/${invoice.id}`);
    expect(current.status).toBe(200);
    expect(current.data.rowVersion).toBe(token);
    expect((await call('/me')).data.user.roles).toContain('Admin');
    expect((await call(`/invoices/${invoice.id}`, 'DELETE')).status).toBe(204);
    expect((await call(`/invoices/${invoice.id}`)).status).toBe(404);
    expect((await call(`/invoices/${invoice.id}/history`)).status).toBe(404);
    expect((await call(`/invoices?search=${marker}`)).data.total).toBe(0);
  }, 60000);
});
