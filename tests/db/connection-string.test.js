import { describe, expect, it } from 'vitest';
import { splitConnectionStringPart } from '../../database/connection-string.js';

describe('SQL Server connection string parsing', () => {
  it('preserves equals signs in values', () => {
    const [key, value] = splitConnectionStringPart(['Password', 'example=with==equals'].join('='));

    expect(key).toBe('Password');
    expect(value).toBe('example=with==equals');
  });
});
