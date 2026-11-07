import { describe, expect, it } from 'vitest';
import { validateDatabaseTarget } from '../../scripts/validate-db-target.js';

describe('Deployment database target validation', () => {
  it('accepts the exact catalog with either supported key', () => {
    expect(() => validateDatabaseTarget('Server=example;Initial Catalog=shriyaminingdb;Password=abc==;', 'shriyaminingdb')).not.toThrow();
    expect(() => validateDatabaseTarget(' DATABASE = SHRIYAMININGDBTEST ;', 'shriyaminingdbtest')).not.toThrow();
  });

  it('rejects obsolete catalogs, environment mixups and substring matches', () => {
    for (const database of ['shriyamining-db', 'shriyamining-db-test', 'shriyaminingdbtest', 'shriyaminingdb-backup']) {
      expect(() => validateDatabaseTarget(`Initial Catalog=${database};`, 'shriyaminingdb')).toThrow();
    }
    expect(() => validateDatabaseTarget('Initial Catalog=shriyaminingdb;', 'shriyaminingdbtest')).toThrow();
    expect(() => validateDatabaseTarget('Password=shriyaminingdb;', 'shriyaminingdb')).toThrow();
  });

  it('rejects empty and ambiguous catalogs without logging the connection string', () => {
    for (const connection of ['', 'Server=example;', 'Database=shriyaminingdb;Initial Catalog=other;']) {
      expect(() => validateDatabaseTarget(connection, 'shriyaminingdb')).toThrow();
    }
    expect(() => validateDatabaseTarget('Database=shriyaminingdb;', 'unknown')).toThrow();
  });
});
