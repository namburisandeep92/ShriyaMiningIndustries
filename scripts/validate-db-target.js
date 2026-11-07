import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateDatabaseTarget(connectionString, expectedDatabase) {
  if (!['shriyaminingdb', 'shriyaminingdbtest'].includes(expectedDatabase)) {
    throw new Error('Unsupported expected database');
  }
  if (!connectionString?.trim()) throw new Error('DB_CONNECTION_STRING is required');
  const catalogs = connectionString.split(';').flatMap(part => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    const key = part.slice(0, separator).trim().toLowerCase();
    return ['initial catalog', 'database'].includes(key) ? [part.slice(separator + 1).trim()] : [];
  });
  if (catalogs.length !== 1 || catalogs[0].toLowerCase() !== expectedDatabase) {
    throw new Error(`Connection string must target exactly ${expectedDatabase}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateDatabaseTarget(process.env.DB_CONNECTION_STRING, process.argv[2]);
    console.log(`Database target verified: ${process.argv[2]}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
