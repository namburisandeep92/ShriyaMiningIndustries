import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, validateEnvironment } from '../../api/server.js';
import { DatabaseService, getDatabase } from '../../api/services/database.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('API startup and local routes', () => {
  it('loads the complete backend using native Node ES modules', () => {
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      "import { createApp } from './api/server.js'; console.log(typeof createApp);",
    ], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
    });

    expect(output.trim()).toBe('function');
  });

  it('accepts an explicit connection string', () => {
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_CONNECTION_STRING', 'Server=example;Initial Catalog=example;');

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('accepts the documented CONNECTION_STRING setting', () => {
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_CONNECTION_STRING', '');
    vi.stubEnv('CONNECTION_STRING', 'Server=example;Initial Catalog=test;');

    expect(() => validateEnvironment()).not.toThrow();
    expect(new DatabaseService().config).toMatchObject({
      server: 'example',
      database: 'test',
    });
  });

  it('accepts complete individual database settings', () => {
    vi.stubEnv('ENVIRONMENT', 'development');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DB_CONNECTION_STRING', '');
    vi.stubEnv('DB_SERVER', 'example');
    vi.stubEnv('DB_DATABASE', 'test');
    vi.stubEnv('DB_USERNAME', 'test');
    vi.stubEnv('DB_PASSWORD', 'test');

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('rejects missing database configuration before connecting', () => {
    vi.stubEnv('ENVIRONMENT', 'development');
    vi.stubEnv('NODE_ENV', 'development');
    for (const key of ['DB_CONNECTION_STRING', 'DB_SERVER', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD']) {
      vi.stubEnv(key, '');
    }

    expect(() => validateEnvironment()).toThrow(
      'Missing required environment variables: DB_SERVER, DB_DATABASE, DB_USERNAME, DB_PASSWORD'
    );
  });

  it('serves public API routes and keeps invoices protected', async () => {
    vi.stubEnv('ENVIRONMENT', 'development');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DB_CONNECTION_STRING', 'Server=example;Initial Catalog=test;');
    vi.spyOn(getDatabase(), 'isHealthy').mockResolvedValue(true);

    const app = await createApp();
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const health = await fetch(`${baseUrl}/api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({
        status: 'healthy',
        database: 'connected',
      });

      const me = await fetch(`${baseUrl}/api/me`);
      expect(me.status).toBe(200);
      expect(await me.json()).toEqual({ authenticated: false, user: null });

      const invoices = await fetch(`${baseUrl}/api/invoices`);
      expect(invoices.status).toBe(401);
      expect(await invoices.json()).toMatchObject({
        error: { code: 'AUTH-LOGIN-401' },
      });
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
