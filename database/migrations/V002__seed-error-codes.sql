/**
 * V002__seed-error-codes.sql
 * 
 * Seed all error codes for Phase 1
 * Idempotent: checks if error code exists before inserting
 * 
 * Error code naming: [DOMAIN]-[ACTION]-[ERROR_TYPE]
 * Example: INV-SAVE-409 (Invoice, Save, Conflict), INV-QUERY-404 (Invoice, Query, NotFound)
 */

-- ============================================================================
-- INVOICE DOMAIN
-- ============================================================================

-- 400-series: Client error
IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'INV-SAVE-409')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('INV-SAVE-409', 'Duplicate Invoice Number', 
        'Invoice number already exists for this month',
        'Error', 
        'An invoice with this number already exists. The system auto-generates numbers, so this is rare.',
        'Duplicate invoice number detected during INSERT',
        'Concurrent invoice creation in same month, or database corruption',
        'app.Invoice table, check InvoiceNumber column for duplicates',
        'Wait 1 minute and retry. If persists, contact admin.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'INV-UPDATE-409')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('INV-UPDATE-409', 'Concurrent Modification', 
        'Invoice was modified by another user since you opened it',
        'Error', 
        'This invoice was updated by another user. Reload the page to see the latest version.',
        'Row version mismatch during UPDATE',
        'User A opened invoice, User B updated it, User A tried to update',
        'app.Invoice table, check RowVersion column',
        'Refresh the page and reapply your changes.');

-- 404-series: Not found
IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'INV-QUERY-404')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('INV-QUERY-404', 'Invoice Not Found', 
        'Invoice ID does not exist or has been deleted',
        'Error', 
        'The invoice you requested does not exist or has been removed.',
        'Invoice ID not found in app.Invoice table',
        'Invoice deleted, wrong ID provided, or database sync issue',
        'app.Invoice table, search by InvoiceId',
        'Check the invoice number in the list and try again.');

-- 500-series: Server error
IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'INV-SAVE-ERROR')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('INV-SAVE-ERROR', 'Failed to Save Invoice', 
        'Unexpected error while creating or updating invoice',
        'Critical', 
        'Could not save the invoice. Please try again or contact support.',
        'Exception in app.usp_Invoice_Create or app.usp_Invoice_UpdateStatus',
        'Database connection lost, constraint violation, or bug',
        'log.ErrorLog table, search by CorrelationId',
        'Retry. If error persists, contact admin with error code.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'INV-UPDATE-ERROR')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('INV-UPDATE-ERROR', 'Failed to Update Invoice', 
        'Unexpected error while updating invoice status',
        'Critical', 
        'Could not update the invoice status. Please try again or contact support.',
        'Exception in app.usp_Invoice_UpdateStatus',
        'Database connection lost, invalid status transition, or bug',
        'log.ErrorLog table, search by CorrelationId',
        'Retry. If error persists, contact admin.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'INV-QUERY-ERROR')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('INV-QUERY-ERROR', 'Failed to Query Invoice', 
        'Unexpected error while retrieving invoice data',
        'Critical', 
        'Could not load the invoice. Please refresh and try again or contact support.',
        'Exception in app.usp_Invoice_GetVersionHistory or SELECT',
        'Database connection lost, table corruption, or bug',
        'log.ErrorLog table, check ErrorLog for SQL error details',
        'Refresh page. If error persists, contact admin.');

-- ============================================================================
-- FILE UPLOAD DOMAIN
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'FILE-UPLOAD-400')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('FILE-UPLOAD-400', 'Invalid File', 
        'Uploaded file is not a valid Excel or CSV format',
        'Error', 
        'Please upload a valid Excel (.xlsx) or CSV file.',
        'File MIME type or structure does not match expected format',
        'Wrong file type uploaded, or file is corrupted',
        'Check file extension and MIME type in API handler',
        'Download the sample PO file and use as template.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'FILE-UPLOAD-413')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('FILE-UPLOAD-413', 'File Too Large', 
        'Uploaded file exceeds maximum size (10 MB)',
        'Error', 
        'The file is too large. Maximum size is 10 MB.',
        'File size > 10485760 bytes',
        'File too large, or compression not applied',
        'Check file size before upload',
        'Split file or compress PO data.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'FILE-UPLOAD-422')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('FILE-UPLOAD-422', 'Invalid File Structure', 
        'File is missing required columns (PO Number, SPS Item, SKU, Quantity, etc.)',
        'Error', 
        'File is missing required columns. Check the sample file for the correct format.',
        'Missing required columns detected during parsing',
        'File template doesn''t match expected schema',
        'Compare uploaded file with sample template',
        'Add missing columns: PO Number, SPS Item, SKU, Quantity, UOM.');

-- ============================================================================
-- VALIDATION DOMAIN
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'VAL-COL-MISSING')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('VAL-COL-MISSING', 'Missing Required Column', 
        'Uploaded file is missing a required column',
        'Error', 
        'File is missing a required column.',
        'Column not found in row header',
        'File template doesn''t match expected schema',
        'File validation logic in API handler',
        'Add missing column using sample template.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'VAL-ROW-INCOMPLETE')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('VAL-ROW-INCOMPLETE', 'Incomplete Row', 
        'A row in the file is missing required values',
        'Error', 
        'One or more rows have missing values. Please fill all required fields.',
        'Row has NULL in required column',
        'User forgot to fill cell or left blank',
        'File parser, check row data',
        'Fill all required fields in every row.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'VAL-QTY-INVALID')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('VAL-QTY-INVALID', 'Invalid Quantity', 
        'Quantity is not a valid positive number',
        'Error', 
        'Quantity must be a positive number.',
        'Quantity <= 0 or not numeric',
        'User entered text or zero',
        'File validation logic',
        'Enter a positive number for quantity.');

-- ============================================================================
-- AUTHORIZATION DOMAIN
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'AUTH-UNAUTHORIZED')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('AUTH-UNAUTHORIZED', 'Unauthorized', 
        'User does not have permission to perform this action',
        'Error', 
        'You do not have permission to perform this action.',
        'User lacks required role or permission',
        'User tried to access resource without permission',
        'security.UserRole and security.RolePermission tables',
        'Contact admin to request access.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'AUTH-UNAUTHENTICATED')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('AUTH-UNAUTHENTICATED', 'Not Authenticated', 
        'User is not logged in',
        'Error', 
        'Please log in to continue.',
        'No JWT token in Authorization header, or token expired',
        'Session expired, or user cleared cookies',
        'API middleware, check Authorization header',
        'Log in again.');

-- ============================================================================
-- DATABASE DOMAIN
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'DB-CONNECTION-TIMEOUT')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('DB-CONNECTION-TIMEOUT', 'Database Connection Timeout', 
        'Could not connect to database within timeout period',
        'Critical', 
        'Database is not responding. Please try again in a moment.',
        'SqlClient connection timeout (default 30s)',
        'Database server down, network issue, or too many open connections',
        'Azure SQL Server status, check connection pool',
        'Wait and retry. If persistent, contact Azure support.');

IF NOT EXISTS (SELECT 1 FROM log.ErrorCode WHERE ErrorCode = 'DB-DEADLOCK')
INSERT INTO log.ErrorCode (ErrorCode, Title, Description, Severity, UserMessage, TechnicalMessage, LikelyCause, WhereToLook, HowToFix)
VALUES ('DB-DEADLOCK', 'Database Deadlock', 
        'Two transactions blocked each other',
        'Warning', 
        'Transaction was rolled back. Please try again.',
        'SQL error 1205 (Deadlock detected)',
        'Concurrent invoice updates in wrong order',
        'log.ErrorLog, look for ErrorNumber = 1205',
        'Retry. If frequent, contact DBA to review query order.');

-- ============================================================================
-- MARK MIGRATION COMPLETE
-- ============================================================================

DELETE FROM __MigrationHistory WHERE MigrationId = 'V002__seed-error-codes';
INSERT INTO __MigrationHistory (MigrationId, ProductVersion) 
VALUES ('V002__seed-error-codes', '1.0.0');

PRINT 'Migration V002__seed-error-codes completed successfully';
