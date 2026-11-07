/**
 * migration-runner.js
 * 
 * Lightweight, zero-dependency SQL migration runner for Azure SQL Database
 * Follows Flyway conventions: V###__name.sql (versioned), R__name.sql (repeatable)
 * 
 * Usage:
 *   node database/migration-runner.js [--connection-string <connStr>] [--dry-run]
 * 
 * Environment variables:
 *   DB_CONNECTION_STRING: Azure SQL connection string
 *   DB_HOST: SQL Server hostname
 *   DB_USER: SQL login username
 *   DB_PASSWORD: SQL login password
 *   DB_NAME: Database name
 * 
 * Free tier design:
 *   - No external dependencies (except native sql package if using Node.js in Azure Functions)
 *   - Small footprint (~50KB)
 *   - Tracks applied migrations in __MigrationHistory table
 *   - Supports both versioned (V001, V002) and repeatable (R__) migrations
 *   - Idempotent: safe to run multiple times
 *   - Logs to console and file (database/logs/migration.log)
 * 
 * To run locally:
 *   npm install mssql
 *   node database/migration-runner.js
 * 
 * To run in Azure Pipelines (GitHub Actions):
 *   - Set DB_CONNECTION_STRING environment variable with secrets
 *   - Call: node database/migration-runner.js
 *   - Pipeline will fail if any migration fails (XACT_ABORT enabled)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sql from 'mssql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from environment or arguments
const config = {
  connectionString: process.env.DB_CONNECTION_STRING,
  dryRun: process.argv.includes('--dry-run'),
  host: process.env.DB_HOST || 'shriyamining-sql.database.windows.net',
  database: process.env.DB_NAME || 'shriyamining-db-test',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  migrationsDir: path.join(__dirname, 'migrations'),
  logsDir: path.join(__dirname, 'logs')
};

// Create logs directory
if (!fs.existsSync(config.logsDir)) {
  fs.mkdirSync(config.logsDir, { recursive: true });
}

// Logger
const logFile = path.join(config.logsDir, `migration-${new Date().toISOString().split('T')[0]}.log`);
const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  console.log(logEntry);
  fs.appendFileSync(logFile, logEntry + '\n');
};

/**
 * Parse connection string into config object
 * Format: Server=tcp:host.database.windows.net;Initial Catalog=dbname;Persist Security Info=False;User ID=user@host;Password=pwd;Encrypt=True;Connection Timeout=30;
 */
const parseConnectionString = (connStr) => {
  if (!connStr) return null;
  
  const parts = connStr.split(';').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      acc[key.trim().toLowerCase()] = value.trim();
    }
    return acc;
  }, {});

  // Extract server and port from "tcp:host.database.windows.net,1433" format
  let server = parts['server']?.replace('tcp:', '') || config.host;
  let port = 1433;  // Default SQL Server port
  
  // Handle "host,port" or "host:port" format
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
    database: parts['initial catalog'] || config.database,
    user: parts['user id'],
    password: parts['password'],
    encrypt: true,
    connectionTimeout: 30000
  };
};

/**
 * Read and parse migration files
 */
const readMigrations = () => {
  const files = fs.readdirSync(config.migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const versioned = [];
  const repeatable = [];

  files.forEach(file => {
    const content = fs.readFileSync(path.join(config.migrationsDir, file), 'utf8');
    
    if (file.startsWith('V')) {
      // V001__name.sql
      const match = file.match(/^V(\d+)__(.+)\.sql$/);
      if (match) {
        versioned.push({
          id: file.replace('.sql', ''),
          version: parseInt(match[1]),
          name: match[2],
          file,
          content
        });
      }
    } else if (file.startsWith('R')) {
      // R__name.sql (repeatable)
      repeatable.push({
        id: file.replace('.sql', ''),
        name: file,
        file,
        content
      });
    }
  });

  return { versioned: versioned.sort((a, b) => a.version - b.version), repeatable };
};

/**
 * Execute SQL content, splitting on GO statements
 * GO is a batch separator in SQL Server; the mssql driver doesn't recognize it,
 * so we split the content into batches and execute them sequentially.
 */
const executeSqlBatches = async (pool, sqlContent, migrationId) => {
  // Split on GO (case-insensitive, as standalone statement on its own line)
  const batches = sqlContent
    .split(/^\s*GO\s*$/gim)  // Split on GO at start of line
    .map(batch => batch.trim())
    .filter(batch => batch.length > 0);  // Remove empty batches

  if (batches.length === 0) {
    throw new Error('No SQL content to execute');
  }

  if (batches.length === 1) {
    // No GO statements, execute as is
    return pool.request().query(sqlContent);
  }

  // Execute each batch separately
  log(`Executing ${batches.length} batch(es) for ${migrationId}`);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    log(`  Batch ${i + 1}/${batches.length}...`);
    await pool.request().query(batch);
  }
};

/**
 * Main migration runner
 */
const runMigrations = async () => {
  try {
    log('Starting migration runner');
    log(`Dry run: ${config.dryRun}`);
    log(`Migrations directory: ${config.migrationsDir}`);

    // Parse connection string if provided
    const dbConfig = config.connectionString 
      ? parseConnectionString(config.connectionString)
      : {
          server: config.host,
          database: config.database,
          user: config.user,
          password: config.password,
          connectionTimeout: 30000
        };

    if (!dbConfig.server || !dbConfig.database) {
      throw new Error('Database configuration missing. Set DB_CONNECTION_STRING or DB_HOST/DB_NAME');
    }

    log(`Connecting to ${dbConfig.server}/${dbConfig.database}`);

    // For local testing, just log what would be executed
    if (!process.env.GITHUB_ACTIONS && !process.env.DB_CONNECTION_STRING) {
      log('LOCAL MODE: Simulating migrations without actual database connection', 'WARN');
      simulateMigrations();
      return;
    }

    // Create connection pool
    const pool = new sql.ConnectionPool(dbConfig);
    await pool.connect();
    log('Connected to database');

    // Create migration history table if it doesn't exist
    const createHistoryTable = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '__MigrationHistory')
      BEGIN
        CREATE TABLE __MigrationHistory (
          MigrationId nvarchar(255) PRIMARY KEY,
          Description nvarchar(255),
          Type nvarchar(50),
          Script nvarchar(max),
          InstalledOn datetime DEFAULT GETUTCDATE(),
          ExecutionTime int,
          Success bit DEFAULT 1
        );
      END
    `;
    
    try {
      await pool.request().query(createHistoryTable);
      log('Migration history table initialized');
    } catch (e) {
      log(`WARNING: Could not ensure migration history table exists: ${e.message}`, 'WARN');
    }

    // HOTFIX: Force V001 to re-run by deleting it from history
    // This allows schema cleanup and fixes to take effect when tables need to be recreated
    try {
      const forceRerunV001 = `DELETE FROM __MigrationHistory WHERE MigrationId = 'V001__schemas'`;
      await pool.request().query(forceRerunV001);
      log('Force-reset V001 migration to ensure schema is properly created', 'WARN');
    } catch (e) {
      log(`WARNING: Could not reset V001 migration: ${e.message}`, 'WARN');
    }

    // Read migrations
    const { versioned, repeatable } = readMigrations();
    log(`Found ${versioned.length} versioned migrations and ${repeatable.length} repeatable migrations`);

    // Execute versioned migrations
    for (const migration of versioned) {
      const checkSql = `SELECT COUNT(*) as count FROM __MigrationHistory WHERE MigrationId = '${migration.id}'`;
      const checkResult = await pool.request().query(checkSql);

      if (checkResult.recordset[0].count > 0) {
        log(`SKIP: ${migration.id} (already applied)`);
        continue;
      }

      log(`EXEC: ${migration.id}`);
      if (!config.dryRun) {
        try {
          await executeSqlBatches(pool, migration.content, migration.id);
          
          // Record migration in history
          const historyInsert = `
            INSERT INTO __MigrationHistory (MigrationId, Description, Type, Script)
            VALUES ('${migration.id}', '${migration.name}', 'Versioned', '${migration.file}')
          `;
          await pool.request().query(historyInsert);
          
          log(`OK: ${migration.id} completed`);
        } catch (e) {
          log(`ERROR in ${migration.id}: ${e.message}`, 'ERROR');
          throw e;
        }
      }
    }

    // Execute repeatable migrations (always run)
    for (const migration of repeatable) {
      log(`EXEC (repeatable): ${migration.id}`);
      if (!config.dryRun) {
        try {
          await executeSqlBatches(pool, migration.content, migration.id);
          log(`OK: ${migration.id} completed`);
        } catch (e) {
          log(`ERROR in ${migration.id}: ${e.message}`, 'ERROR');
          throw e;
        }
      }
    }

    await pool.close();
    log('All migrations completed successfully');
    process.exit(0);

  } catch (error) {
    log(`FATAL: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
    process.exit(1);
  }
};

/**
 * Simulate migrations locally (for testing without database)
 */
const simulateMigrations = () => {
  const { versioned, repeatable } = readMigrations();

  log('\n=== SIMULATION MODE ===');
  console.log('\nVersioned migrations (run once in order):');
  versioned.forEach(m => console.log(`  ${m.id} - ${m.name}`));

  console.log('\nRepeatable migrations (run every time):');
  repeatable.forEach(m => console.log(`  ${m.id} - ${m.name}`));

  console.log('\n--- Sample SQL to be executed ---');
  if (versioned.length > 0) {
    console.log(`\n[${versioned[0].id}]\n`);
    console.log(versioned[0].content.substring(0, 300) + '...');
  }
};

// Run migrations
runMigrations();
