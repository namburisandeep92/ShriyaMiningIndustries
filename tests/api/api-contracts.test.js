import { describe, expect, it } from 'vitest';
import { companyProfileInput, invoiceResponse, invoiceStatus, pagedResponse, paging, rowVersion, validateItems } from '../../api/services/api-contracts.js';
import * as correlationId from '../../api/middleware/correlation-id.js';
import { apiClient } from '../../app/src/services/api.ts';
import { readFile } from 'node:fs/promises';

describe('Database-backed API contracts', () => {
  it('validates supported statuses and rejects fabricated states', () => {
    expect(invoiceStatus('in review')).toBe('In Review');
    expect(invoiceStatus('Approved')).toBe('Approved');
    expect(() => invoiceStatus('paid')).toThrow();
    expect(() => invoiceStatus(['Draft'])).toThrow();
  });

  it('requires bounded, positive paging values', () => {
    expect(paging({ page: '2', pageSize: '10' })).toEqual({ pageNum: 2, pageSize: 10 });
    for (const pageSize of ['0', '-1', '101', '1.5', 'NaN']) expect(() => paging({ pageSize })).toThrow();
  });

  it('decodes exactly the returned binary concurrency token', () => {
    const bytes = Buffer.from('00000000a1b2c3d4', 'hex');
    expect(rowVersion(bytes.toString('hex'))).toEqual(bytes);
    for (const invalid of ['', 'not-a-token', '00', null]) expect(() => rowVersion(invalid)).toThrow();
  });

  it('requires valid nonempty invoice lines and normalizes UI names', () => {
    expect(validateItems([{ description: ' Stone ', quantity: 2, unitPrice: 12.34, taxPercent: 18 }]))
      .toEqual([{ description: 'Stone', quantity: 2, rate: 12.34, taxRate: 18, unitOfMeasure: 'SF' }]);
    for (const items of [[], [null], [false], [{ description: 'x', quantity: -1, rate: 1 }],
      [{ description: 'x', quantity: 1, rate: Infinity }], [{ description: 'x', quantity: 1, rate: 1, taxRate: 101 }]]) {
      expect(() => validateItems(items)).toThrow();
    }
  });

  it('validates company profile requirements and normalizes registration identifiers', () => {
    const profile = companyProfileInput({
      legalName: ' Shriya Mining Industries ', addressLine1: ' S.No. 1 ',
      email: ' accounts@example.com ', gstin: ' abcd1234 ', iec: ' a1b2c3 ', ifsc: ' sbIN0001 ',
    });
    expect(profile).toMatchObject({
      legalName: 'Shriya Mining Industries', addressLine1: 'S.No. 1',
      email: 'accounts@example.com', gstin: 'ABCD1234', iec: 'A1B2C3', ifsc: 'SBIN0001',
    });
    expect(profile.addressLine2).toBeNull();
    expect(() => companyProfileInput({ legalName: '', addressLine1: 'Address' })).toThrow();
    expect(() => companyProfileInput({ legalName: 'SMI', addressLine1: 'Address', email: 'not-an-email' })).toThrow();
  });

  it('uses separate pagination metadata for an empty page', () => {
    expect(pagedResponse({ recordset: [], recordsets: [[], [{ TotalCount: 17 }]] }, 3, 10))
      .toEqual({ total: 17, pagination: { page: 3, pageSize: 10, totalCount: 17, totalPages: 2 } });
    expect(() => pagedResponse({ recordsets: [[]] }, 1, 10)).toThrow();
  });

  it('maps header and line aliases, rounded totals and hexadecimal tokens once', () => {
    const response = invoiceResponse({
      InvoiceId: 'id', Status: 'In Review', TotalAmount: 24.68, TaxAmount: 4.44,
      FinalAmount: 29.12, RowVersion: Buffer.from('00000000a1b2c3d4', 'hex'),
      VendorName: 'Current profile name', DocumentJson: JSON.stringify({ header: { Exporter: 'Saved exporter\nSaved address' } }),
    }, [{ Description: 'Stone', Rate: 12.34, Quantity: 2, TaxRate: 18 }]);
    expect(response.status).toBe('in review');
    expect(response.rowVersion).toBe('00000000a1b2c3d4');
    expect(response.totals).toEqual({ subtotal: 24.68, tax: 4.44, total: 29.12 });
    expect(response.vendorName).toBe('Saved exporter');
    expect(response.lineItems[0]).toMatchObject({ unitPrice: 12.34, taxPercent: 18 });
  });

  it('makes browser correlation IDs compatible with UNIQUEIDENTIFIER procedure parameters', () => {
    const request = apiClient.instance.interceptors.request.handlers[0].fulfilled({ headers: {} });
    const id = request.headers['X-Correlation-ID'];
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    let forwarded;
    correlationId.middleware({ headers: { 'x-correlation-id': id } }, { setHeader() {}, locals: {} }, error => { forwarded = error; });
    expect(forwarded).toBeUndefined();
    correlationId.middleware({ headers: { 'x-correlation-id': 'invalid' } }, {}, error => { forwarded = error; });
    expect(forwarded.statusCode).toBe(400);
  });

  it('aligns UI update and export paths with deployed routes', async () => {
    const calls = [];
    const original = apiClient.instance.defaults.adapter;
    apiClient.instance.defaults.adapter = async config => {
      calls.push(config);
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    try {
      await apiClient.updateInvoice('id', { notes: 'x' }, '00000000a1b2c3d4');
      await apiClient.exportInvoiceAsExcel('id');
      await apiClient.searchErrorLogs({ page: 1 });
      await apiClient.updateCompanyProfile(await apiClient.getCompanyProfile());
      expect(calls[0]).toMatchObject({ method: 'patch', url: '/invoices/id' });
      expect(calls[0].headers['X-Row-Version']).toBe('00000000a1b2c3d4');
      expect(calls[1]).toMatchObject({ url: '/invoices/id/export', params: { format: 'excel' } });
      expect(calls[2].url).toBe('/admin/error-log');
      expect(calls[3]).toMatchObject({ method: 'get', url: '/company-profile' });
      expect(calls[4]).toMatchObject({ method: 'put', url: '/company-profile' });
    } finally {
      apiClient.instance.defaults.adapter = original;
    }
  });

  it('keeps versioned migrations non-destructive and every procedure schema-qualified', async () => {
    const schema = await readFile(new URL('../../database/migrations/V001__schemas.sql', import.meta.url), 'utf8');
    const runner = await readFile(new URL('../../database/migration-runner.js', import.meta.url), 'utf8');
    expect(schema).not.toMatch(/DROP\s+TABLE/i);
    expect(runner).not.toMatch(/DELETE\s+FROM\s+(?:dbo\.)?__MigrationHistory/i);
    for (const name of ['invoice-crud', 'invoice-export', 'invoice-history', 'po-import', 'admin']) {
      const source = await readFile(new URL(`../../api/functions/${name}.js`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/\.execute\(['"]usp_/);
    }
  });
});
