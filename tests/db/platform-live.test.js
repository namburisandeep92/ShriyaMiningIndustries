import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';

const enabled = process.env.SMI_LIVE_DB_TEST === 'test';

describe.skipIf(!enabled)('Platform contracts against guarded test SQL', () => {
  let db, server, base, vendorId, buyerId, invoice, importId, createdUserId, adminId, errorLogId, originalRoles;
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
  }, 120000);

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    if (db?.pool) {
      if (invoice) {
        for (const table of ['InvoiceSnapshot', 'InvoiceHistory', 'InvoiceLine', 'Invoice']) {
          await db.query(`DELETE app.${table} WHERE InvoiceId=@id`, { id: invoice.id });
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

  it('imports workbook columns correctly and lists completed batches', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('PO');
    sheet.addRow(['Line Number', 'Product Code', 'Description', 'Quantity', 'Unit Rate', 'Tax Rate']);
    sheet.addRow([1, 'PRODUCT-A', marker, 3, 12.34, 18]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
    const imported = await call('/po-import', 'POST', { vendorId, poNumber: marker, fileName: 'fixture.xlsx', file });
    expect(imported.status).toBe(201);
    importId = imported.data.importId;
    expect(imported.data).toMatchObject({ status: 'completed', itemsCount: 1 });
    const rows = await db.query('SELECT SKU,Quantity,RawData FROM sales.POLine WHERE POImportBatchId=@id', { id: importId });
    expect(rows[0].SKU).toBe('PRODUCT-A');
    expect(JSON.parse(rows[0].RawData).rate).toBe(12.34);
    const batches = await call(`/po-import?vendorId=${vendorId}`);
    expect(batches.data.imports.some(value => value.importId === importId)).toBe(true);
    sheet.addRow([2, 'PRODUCT-B', 'Invalid', -1, 10, 0]);
    const invalid = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
    expect((await call('/po-import', 'POST', { vendorId, poNumber: marker, fileName: 'fixture.xlsx', file: invalid })).status).toBe(400);
    expect((await db.query('SELECT COUNT(*) n FROM sales.POImportBatch WHERE VendorId=@id', { id: vendorId }))[0].n).toBe(1);
  }, 60000);

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
