import { afterEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => {
  vi.resetModules();
  return (await import('../../api/azure-handler.js')).default;
};

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
