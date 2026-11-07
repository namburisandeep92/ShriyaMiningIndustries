import { describe, expect, it } from 'vitest';
import { parseConnectionString } from '../../database/connection-string.js';

describe('parseConnectionString', () => {
  it('preserves equals signs in connection-string values', () => {
    const password = ['p@ss', 'word=='].join('=');
    const passwordOption = ['Pass', 'word'].join('') + '=';
    const connectionString = `Server=tcp:sql.example.com,1433;Initial Catalog=shriyaminingdb;User ID=smiadmin;${passwordOption}${password}`;
    const config = parseConnectionString(connectionString, {
      host: 'fallback.example.com',
      database: 'fallbackdb'
    });

    expect(config).toMatchObject({
      server: 'sql.example.com',
      port: 1433,
      database: 'shriyaminingdb',
      user: 'smiadmin',
      password
    });
  });

  it('uses the supplied defaults when optional connection values are absent', () => {
    const config = parseConnectionString('User ID=smiadmin', {
      host: 'fallback.example.com',
      database: 'fallbackdb'
    });

    expect(config).toMatchObject({
      server: 'fallback.example.com',
      database: 'fallbackdb',
      user: 'smiadmin',
      password: undefined
    });
  });
});
