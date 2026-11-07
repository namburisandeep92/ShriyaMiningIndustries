import { afterEach, describe, expect, it, vi } from 'vitest';
import sql from 'mssql';
import { DatabaseService } from '../../api/services/database.js';
import { readFile } from 'node:fs/promises';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Runtime database environment isolation', () => {
  function mockPool(databaseName) {
    const pool = {
      connect: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue(),
      request: vi.fn().mockReturnValue({ query: vi.fn().mockResolvedValue({ recordset: [{ databaseName }] }) }),
    };
    vi.spyOn(sql, 'ConnectionPool').mockImplementation(function () { return pool; });
    return pool;
  }

  it.each([['production', 'shriyaminingdb'], ['test', 'shriyaminingdbtest']])(
    'verifies the connected catalog for %s', async (environment, catalog) => {
      vi.stubEnv('ENVIRONMENT', environment);
      mockPool(catalog);
      const db = new DatabaseService();
      await db.connect(1);
      expect(db.databaseName).toBe(catalog);
      await db.close();
      expect(db.databaseName).toBeNull();
    }
  );

  it.each([['production', 'shriyaminingdbtest'], ['test', 'shriyaminingdb']])(
    'refuses cross-environment connections for %s', async (environment, catalog) => {
      vi.stubEnv('ENVIRONMENT', environment);
      const pool = mockPool(catalog);
      const db = new DatabaseService();
      await expect(db.connect(1)).rejects.toThrow('Connected database does not match');
      expect(pool.close).toHaveBeenCalled();
      expect(db.pool).toBeNull();
      expect(db.databaseName).toBeNull();
    }
  );

  it('keeps hostname tokens, build modes and migration/smoke targets aligned', async () => {
    for (const [hostname, environment, database, token] of [
      ['victorious-grass-078778700', 'production', 'shriyaminingdb', 'VICTORIOUS_GRASS_078778700'],
      ['nice-water-0523f0500', 'test', 'shriyaminingdbtest', 'NICE_WATER_0523F0500'],
    ]) {
      const source = await readFile(new URL(`../../.github/workflows/azure-static-web-apps-${hostname}.yml`, import.meta.url), 'utf8');
      expect(source).toContain(`EXPECTED_ENVIRONMENT: ${environment}`);
      expect(source).toContain(`EXPECTED_DATABASE: ${database}`);
      expect(source).toContain(`node scripts/validate-db-target.js ${database}`);
      expect(source).toContain(`secrets.DB_CONNECTION_STRING_${environment === 'production' ? 'PROD' : 'TEST'}`);
      expect(source.match(/secrets\.AZURE_STATIC_WEB_APPS_API_TOKEN_[A-Z0-9_]+/g))
        .toEqual([`secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_${token}`, `secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_${token}`]);
      expect(source).toContain(environment === 'production' ? 'run: npm run app:build' : 'run: npm --prefix app run build -- --mode test');
    }
  });
});
