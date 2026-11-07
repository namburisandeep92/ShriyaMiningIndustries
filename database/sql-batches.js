export const splitSqlBatches = (sqlContent) => sqlContent
  .split(/^\s*GO\s*$/gim)
  .map(batch => batch.trim())
  .filter(batch => batch.length > 0);
