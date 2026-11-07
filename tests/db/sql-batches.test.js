import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitSqlBatches } from '../../database/sql-batches.js';

describe('splitSqlBatches', () => {
  it('splits SQL on standalone GO separators', () => {
    const batches = splitSqlBatches('SELECT 1;\nGO\nSELECT 2;\nGO\n');

    expect(batches).toEqual(['SELECT 1;', 'SELECT 2;']);
    expect(batches.every(batch => !/^GO$/im.test(batch))).toBe(true);
  });

  it('splits CRLF migration files and ignores GO within SQL statements', () => {
    const batches = splitSqlBatches("SELECT 'GO';\r\nGO\r\nSELECT 2;\r\n");

    expect(batches).toEqual(["SELECT 'GO';", 'SELECT 2;']);
  });

  it('removes all GO separators from the repeatable error-handling migration', () => {
    const migration = readFileSync(
      new URL('../../database/migrations/R__error-handling.sql', import.meta.url),
      'utf8'
    );

    const batches = splitSqlBatches(migration);

    expect(batches).toHaveLength(5);
    expect(batches.every(batch => !/^GO$/im.test(batch))).toBe(true);
  });
});
