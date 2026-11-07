/**
 * Database Service
 * Handles connection pooling, query execution, and retry logic
 * 
 * Features:
 * - Connection pooling
 * - Automatic retry on failure (handles free tier auto-pause)
 * - Parameterized queries (safe from SQL injection)
 * - Error logging with correlation ID
 */

import sql from 'mssql';

class DatabaseService {
  constructor() {
    this.pool = null;
    this.config = {
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      authentication: {
        type: 'default',
        options: {
          userName: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
        },
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000,
        requestTimeout: 60000,
        connectionRetryInterval: 1000,
      },
    };

    // Parse connection string if provided (ADO.NET format)
    if (process.env.DB_CONNECTION_STRING) {
      this.config = this._parseConnectionString(process.env.DB_CONNECTION_STRING);
    }
  }

  /**
   * Parse ADO.NET connection string to mssql config
   * Format: Server=...; Initial Catalog=...; User ID=...; Password=...;
   */
  _parseConnectionString(connStr) {
    const config = {
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000,
        requestTimeout: 60000,
      },
    };

    const parts = connStr.split(';').filter(p => p.trim());
    parts.forEach(part => {
      // Split on the FIRST '=' only, so passwords containing '=' are preserved
      const idx = part.indexOf('=');
      if (idx === -1) return;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      
      if (key.toLowerCase() === 'server') {
        config.server = value.replace('tcp:', '').split(',')[0];
        if (value.includes(',')) {
          config.port = parseInt(value.split(',')[1]);
        }
      } else if (key.toLowerCase() === 'initial catalog') {
        config.database = value;
      } else if (key.toLowerCase() === 'user id') {
        config.authentication = config.authentication || {};
        config.authentication.type = 'default';
        config.authentication.options = config.authentication.options || {};
        config.authentication.options.userName = value;
      } else if (key.toLowerCase() === 'password') {
        config.authentication = config.authentication || {};
        config.authentication.options = config.authentication.options || {};
        config.authentication.options.password = value;
      }
    });

    return config;
  }

  /**
   * Connect to database
   * Retries on failure to handle free tier auto-pause
   */
  async connect(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[DB] Connecting... (attempt ${attempt}/${maxRetries})`);
        this.pool = new sql.ConnectionPool(this.config);
        await this.pool.connect();
        console.log('[DB] Connected successfully');
        return;
      } catch (err) {
        console.error(`[DB] Connection failed (attempt ${attempt}):`, err.message);
        
        if (attempt < maxRetries) {
          // Wait before retry (handles free tier wake-up)
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[DB] Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${err.message}`);
        }
      }
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  /**
   * Execute a query with parameters
   * Returns: result.recordset (array of rows)
   * 
   * Example:
   *   const rows = await db.query(
   *     'SELECT * FROM [app].[Invoice] WHERE InvoiceId = @id',
   *     { id: '123' }
   *   );
   */
  async query(sqlText, parameters = {}) {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const request = this.pool.request();
      
      // Add parameters
      Object.entries(parameters).forEach(([key, value]) => {
        request.input(key, value);
      });

      const result = await request.query(sqlText);
      return result.recordset || [];
    } catch (err) {
      // Log query error
      console.error('[DB] Query error:', {
        query: sqlText.substring(0, 200),
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Execute a stored procedure
   * Returns: result.recordset (array of rows) or result.rowsAffected
   * 
   * Example:
   *   const result = await db.execute('usp_Invoice_Create', {
   *     VendorId: 1,
   *     InvoiceNumber: 'SMI-2025-11-001',
   *     ...
   *   });
   */
  async execute(procName, parameters = {}) {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const request = this.pool.request();
      
      // Add parameters
      Object.entries(parameters).forEach(([key, value]) => {
        request.input(key, value);
      });

      const result = await request.execute(procName);
      return {
        recordset: result.recordset || [],
        rowsAffected: result.rowsAffected,
        returnValue: result.returnValue,
      };
    } catch (err) {
      console.error('[DB] Execute error:', {
        procedure: procName,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Begin transaction
   */
  async beginTransaction() {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    
    const request = this.pool.request();
    await request.query('BEGIN TRANSACTION');
    return request;
  }

  /**
   * Commit transaction
   */
  async commit() {
    if (this.currentTransaction) {
      await this.currentTransaction.query('COMMIT');
    }
  }

  /**
   * Rollback transaction
   */
  async rollback() {
    if (this.currentTransaction) {
      await this.currentTransaction.query('ROLLBACK');
    }
  }

  /**
   * Check if database is healthy (simple health check)
   */
  async isHealthy() {
    try {
      const result = await this.query('SELECT 1 AS healthy');
      return result.length > 0 && result[0].healthy === 1;
    } catch (err) {
      return false;
    }
  }
}

// Singleton instance
let dbInstance = null;

const getDatabase = () => {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
};

export {
  DatabaseService,
  getDatabase,
};
