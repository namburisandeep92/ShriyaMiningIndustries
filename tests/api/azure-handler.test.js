import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

const loadHandler = async () => {
  vi.resetModules();
  return (await import('../../api/azure-handler.js')).default;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Azure Functions Express entrypoint', () => {
  it('preserves XLSX and PDF bytes through the actual Azure adapter after saving an invoice', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_CONNECTION_STRING', 'Server=example;Initial Catalog=test;');
    const handler = await loadHandler();
    const { getDatabase } = await import('../../api/services/database.js');
    const db = getDatabase();
    vi.spyOn(db, 'connect').mockResolvedValue();
    vi.spyOn(db, 'query').mockResolvedValue([{ RoleName: 'User', PermissionName: 'invoice.read' },
      { RoleName: 'User', PermissionName: 'invoice.create' }]);
    const header = {
      InvoiceId: '11111111-1111-4111-8111-111111111111', InvoiceNumber: 'BINARY-TEST',
      InvoiceDate: new Date('2026-11-07'), Status: 'Draft', TotalAmount: 7.04, TaxAmount: 0, FinalAmount: 7.04,
      RowVersion: Buffer.from('0000000000000001', 'hex'),
    };
    const lines = [{ Description: 'Stone', Quantity: 7, Rate: 1.005, LineAmount: 7.04, TaxRate: 0, Tax: 0 }];
    vi.spyOn(db, 'execute').mockResolvedValue({ recordset: [header], recordsets: [[header], lines] });
    const principal = Buffer.from(JSON.stringify({ userDetails: 'fixture@example.invalid' })).toString('base64');
    const invoke = (path, method = 'GET', body) => {
      const req = { method, url: `https://example.azurestaticapps.net/api${path}`,
        headers: { 'x-ms-client-principal': principal, 'content-type': 'application/json' },
        rawBody: body ? JSON.stringify(body) : undefined };
      return handler({ req, traceContext: {}, log: { error: vi.fn() } }, req);
    };
    const created = await invoke('/invoices', 'POST', {
      vendorId: 1, buyerId: 1, invoiceDate: '2026-11-07',
      items: [{ description: 'Stone', quantity: 7, rate: 1.005 }],
    });
    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.body).invoiceNumber).toBe('BINARY-TEST');
    const excel = await invoke(`/invoices/${header.InvoiceId}/export?format=excel`);
    expect(excel.statusCode).toBe(200);
    expect(Buffer.isBuffer(excel.body)).toBe(true);
    expect(excel.body.subarray(0, 2).toString()).toBe('PK');
    expect(Number(excel.headers['content-length'])).toBe(excel.body.length);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.body);
    expect(workbook.worksheets[0].name).toBe('Invoice');
    const { headerDefaults } = await import('../../api/services/legacy-invoice.js');
    header.DocumentJson = JSON.stringify({
      header: { ...headerDefaults, 'Invoice no': 'BINARY-TEST', 'Invoice date': '2026-11-07' },
      words: 'USD SEVEN AND CENTS FOUR ONLY',
      hsnCodes: { 'GRANITE TILES': '68022310' },
      lines: [{ stone: 'Stone', finish: '', size: '', ref: '', kind: 'GRANITE TILES', qty: 7, crates: 2,
        crt: '1001 - 1002', uom: 'PC', net: '', rate: 1.005 }],
    });
    const legacyExcel = await invoke(`/invoices/${header.InvoiceId}/export?format=excel`);
    expect(legacyExcel.statusCode).toBe(200);
    expect(Buffer.isBuffer(legacyExcel.body)).toBe(true);
    expect(Number(legacyExcel.headers['content-length'])).toBe(legacyExcel.body.length);
    const legacyWorkbook = new ExcelJS.Workbook();
    await legacyWorkbook.xlsx.load(legacyExcel.body);
    expect(legacyWorkbook.worksheets.map(sheet => sheet.name)).toEqual(['INV', 'PACKING']);
    delete header.DocumentJson;
    const pdf = await invoke(`/invoices/${header.InvoiceId}/export?format=pdf`);
    expect(pdf.statusCode).toBe(200);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(Number(pdf.headers['content-length'])).toBe(pdf.body.length);
  }, 15000);

  it('connects once and preserves API paths, HTTP status and JSON bodies', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_CONNECTION_STRING', 'Server=example;Initial Catalog=test;');
    vi.stubEnv('FUNCTIONS_EXTENSION_VERSION', '');
    const handler = await loadHandler();
    const { getDatabase: getFreshDatabase } = await import('../../api/services/database.js');
    const connect = vi.spyOn(getFreshDatabase(), 'connect').mockResolvedValue();
    vi.spyOn(getFreshDatabase(), 'isHealthy').mockResolvedValue(true);

    const invoke = path => {
      const req = { method: 'GET', url: `https://example.azurestaticapps.net${path}`, headers: {} };
      const context = { req, traceContext: {}, log: { error: vi.fn() } };
      return handler(context, req);
    };

    const health = await invoke('/api/health');
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({ status: 'healthy', database: 'connected' });
    const me = await invoke('/api/me');
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body)).toEqual({ authenticated: false, user: null });
    const invoices = await invoke('/api/invoices');
    expect(invoices.statusCode).toBe(401);
    expect(JSON.parse(invoices.body).error.code).toBe('AUTH-LOGIN-401');
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reports configuration failure without revealing configuration values', async () => {
    vi.stubEnv('ENVIRONMENT', 'invalid-private-value');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_CONNECTION_STRING', 'Server=example;Initial Catalog=test;');
    const handler = await loadHandler();
    const context = { log: { error: vi.fn() } };
    const response = await handler(context, {});
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body).error).toMatchObject({
      code: 'API-CONFIG-503',
      referenceId: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(response.body).not.toContain('invalid-private-value');
    expect(context.log.error).toHaveBeenCalled();
  });

  it('reports a failed database connection and retries initialization on the next request', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_CONNECTION_STRING', 'Server=example;Initial Catalog=test;');
    const handler = await loadHandler();
    const { getDatabase: getFreshDatabase } = await import('../../api/services/database.js');
    const connect = vi.spyOn(getFreshDatabase(), 'connect')
      .mockRejectedValueOnce(new Error('private database details'))
      .mockResolvedValueOnce();
    vi.spyOn(getFreshDatabase(), 'isHealthy').mockResolvedValue(true);
    const req = { method: 'GET', url: 'https://example.azurestaticapps.net/api/health', headers: {} };
    const context = { req, traceContext: {}, log: { error: vi.fn() } };
    const failure = await handler(context, req);
    expect(failure.statusCode).toBe(503);
    expect(JSON.parse(failure.body).error.code).toBe('DB-CONNECT-503');
    expect(failure.body).not.toContain('private database details');
    expect(failure.headers['Cache-Control']).toBe('no-store');
    expect(context.log.error).toHaveBeenCalled();
    const recovery = await handler(context, req);
    expect(recovery.statusCode).toBe(200);
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
