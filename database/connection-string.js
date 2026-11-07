/**
 * Parse an Azure SQL connection string into an mssql configuration object.
 */
export const parseConnectionString = (connStr, defaults = {}) => {
  if (!connStr) return null;

  const parts = connStr.split(';').reduce((acc, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex !== -1) {
      const key = part.slice(0, separatorIndex).trim().toLowerCase();
      const value = part.slice(separatorIndex + 1).trim();
      if (key && value) {
        acc[key] = value;
      }
    }
    return acc;
  }, {});

  let server = parts['server']?.replace('tcp:', '') || defaults.host;
  let port = 1433;

  if (server.includes(',')) {
    [server, port] = server.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else if (server.includes(':')) {
    [server, port] = server.split(':').map(s => s.trim());
    port = parseInt(port) || 1433;
  }

  return {
    server: server,
    port: port,
    database: parts['initial catalog'] || defaults.database,
    user: parts['user id'],
    password: parts['password'],
    encrypt: true,
    connectionTimeout: 30000
  };
};
