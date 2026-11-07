import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeSqlBatches } from '../../database/migration-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('migration runner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes each GO-delimited repeatable procedure in its own batch', async () => {
    const migrationPath = path.resolve(__dirname, '../../database/migrations/R__error-handling.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');
    const executedBatches = [];
    const pool = {
      request: () => ({
        query: async batch => executedBatches.push(batch)
      })
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await executeSqlBatches(pool, sqlContent, 'R__error-handling');

    expect(executedBatches).toHaveLength(5);
    expect(executedBatches.map(batch => batch.match(/CREATE OR ALTER PROCEDURE ([\w.]+)/)?.[1]))
      .toEqual([
        'log.usp_ErrorLog_Insert',
        'log.usp_ErrorLog_Purge',
        'app.usp_Invoice_Create',
        'app.usp_Invoice_UpdateStatus',
        'app.usp_Invoice_GetVersionHistory'
      ]);
    expect(executedBatches.every(batch => !/^\s*GO\s*$/im.test(batch))).toBe(true);
  });
});
