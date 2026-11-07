import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../database/migrations/R__error-handling.sql', import.meta.url),
  'utf8'
);

describe('error-handling migration', () => {
  it('uses the error-code catalog for purge severity', () => {
    const purgeProcedure = migration.slice(
      migration.indexOf('CREATE OR ALTER PROCEDURE log.usp_ErrorLog_Purge'),
      migration.indexOf("PRINT 'Procedure log.usp_ErrorLog_Purge")
    );

    expect(purgeProcedure.match(/FROM log\.ErrorLog AS errorLog\s+LEFT JOIN log\.ErrorCode AS errorCode/gi))
      .toHaveLength(2);
    expect(purgeProcedure.match(/ISNULL\(errorCode\.Severity, 'Error'\)/g)).toHaveLength(2);
    expect(purgeProcedure).not.toMatch(/AND\s+Severity\b/);
  });

  it('uses a variable for the dynamic status-transition THROW message', () => {
    expect(migration).toContain(
      "SET @ErrorMessage = 'Invalid status transition from ' + @CurrentStatus + ' to ' + @NewStatus;\n      THROW 50400, @ErrorMessage, 1;"
    );
    expect(migration).not.toMatch(/THROW\s+\d+\s*,[^;\n]*\+/);
  });
});
