import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDatabase } from '../../api/services/database.js';
import handler from '../../api/azure-handler.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Azure Functions Express entrypoint', () => {
  it('connects once and preserves API paths, HTTP status and JSON bodies', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_CONNECTION_STRING', 'Server=example;Initial Catalog=test;');
    vi.stubEnv('FUNCTIONS_EXTENSION_VERSION', '');
    const connect = vi.spyOn(getDatabase(), 'connect').mockResolvedValue();
    vi.spyOn(getDatabase(), 'isHealthy').mockResolvedValue(true);

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
});
