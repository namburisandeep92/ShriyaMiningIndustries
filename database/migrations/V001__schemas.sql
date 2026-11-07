/**
 * V001__schemas.sql
 * 
 * Create all required schemas for Phase 1 + Phase 2/3 tables
 * Idempotent: can be run multiple times safely
 * 
 * Schemas:
 * - security: Users, Roles, Permissions
 * - app: Invoice, PO, Templates, Master data (Vendors, Buyers)
 * - sales: PO header/lines, Import batches, Fulfillment
 * - log: ErrorLog, ErrorCode, ApplicationEvent, audit trail
 * 
 * Collation: SQL_Latin1_General_CP1_CI_AS (case-insensitive for Indian names)
 * 
 * AUDIT COLUMNS (on every table):
 * - CreatedOn: UTC datetime, default GETUTCDATE()
 * - CreatedBy: nvarchar(255), user email
 * - ModifiedOn: UTC datetime, default GETUTCDATE()
 * - ModifiedBy: nvarchar(255), user email
 * - IsDeleted: bit, default 0 (soft delete)
 * - RowVersion: binary(8), SQL managed (concurrency)
 * 
 * Run once per environment. Safe to re-run.
 */

-- ============================================================================
-- SCHEMAS
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'security')
BEGIN
  EXEC sp_executesql N'CREATE SCHEMA security';
END;

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'app')
BEGIN
  EXEC sp_executesql N'CREATE SCHEMA app';
END;

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'sales')
BEGIN
  EXEC sp_executesql N'CREATE SCHEMA sales';
END;

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'log')
BEGIN
  EXEC sp_executesql N'CREATE SCHEMA log';
END;

-- ============================================================================
-- LOG SCHEMA (Error tracking, must exist first)
-- ============================================================================

/**
 * ErrorCode: Catalog of all possible error codes
 * Referenced by stored procedures and error handlers
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('log') AND name = 'ErrorCode')
BEGIN
  CREATE TABLE log.ErrorCode (
    ErrorCode NVARCHAR(25) PRIMARY KEY,
    Title NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500) NOT NULL,
    Severity NVARCHAR(20) NOT NULL CHECK (Severity IN ('Critical', 'Error', 'Warning', 'Info')),
    UserMessage NVARCHAR(500) NOT NULL,
    TechnicalMessage NVARCHAR(1000) NULL,
    LikelyCause NVARCHAR(500) NULL,
    WhereToLook NVARCHAR(500) NULL,
    HowToFix NVARCHAR(1000) NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL
  );

  CREATE NONCLUSTERED INDEX IX_ErrorCode_Severity 
    ON log.ErrorCode (Severity) WHERE IsDeleted = 0;
END;

/**
 * ErrorLog: Application error log
 * Captures every error from database, API, and client layers
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('log') AND name = 'ErrorLog')
BEGIN
  CREATE TABLE log.ErrorLog (
    ErrorLogId BIGINT PRIMARY KEY IDENTITY(1,1),
    CorrelationId UNIQUEIDENTIFIER NOT NULL,
    ErrorCode NVARCHAR(25) NULL,
    Layer NVARCHAR(20) NOT NULL CHECK (Layer IN ('Database', 'API', 'Client')),
    SqlErrorNumber INT NULL,
    SqlProcedureName NVARCHAR(255) NULL,
    SqlLineNumber INT NULL,
    SqlMessage NVARCHAR(MAX) NULL,
    StackTrace NVARCHAR(MAX) NULL,
    UserId NVARCHAR(255) NULL,
    IpAddress NVARCHAR(45) NULL,
    UserAgent NVARCHAR(1024) NULL,
    RequestPath NVARCHAR(1024) NULL,
    RequestMethod NVARCHAR(10) NULL,
    IsResolved BIT NOT NULL DEFAULT 0,
    ResolvedOn DATETIME2(7) NULL,
    ResolvedBy NVARCHAR(255) NULL,
    ResolutionNotes NVARCHAR(MAX) NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL,
    CONSTRAINT FK_ErrorLog_ErrorCode FOREIGN KEY (ErrorCode) REFERENCES log.ErrorCode(ErrorCode)
  );

  CREATE NONCLUSTERED INDEX IX_ErrorLog_CorrelationId 
    ON log.ErrorLog (CorrelationId) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_ErrorLog_CreatedOn 
    ON log.ErrorLog (CreatedOn DESC) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_ErrorLog_ErrorCode 
    ON log.ErrorLog (ErrorCode) WHERE IsDeleted = 0;
END;

/**
 * ApplicationEvent: General application event log (Info/Warning level)
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('log') AND name = 'ApplicationEvent')
BEGIN
  CREATE TABLE log.ApplicationEvent (
    ApplicationEventId BIGINT PRIMARY KEY IDENTITY(1,1),
    CorrelationId UNIQUEIDENTIFIER NOT NULL,
    EventType NVARCHAR(50) NOT NULL,
    Severity NVARCHAR(20) NOT NULL CHECK (Severity IN ('Critical', 'Error', 'Warning', 'Info')),
    Message NVARCHAR(MAX) NOT NULL,
    UserId NVARCHAR(255) NULL,
    Details NVARCHAR(MAX) NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0
  );

  CREATE NONCLUSTERED INDEX IX_ApplicationEvent_CreatedOn 
    ON log.ApplicationEvent (CreatedOn DESC) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_ApplicationEvent_EventType 
    ON log.ApplicationEvent (EventType) WHERE IsDeleted = 0;
END;

-- ============================================================================
-- SECURITY SCHEMA
-- ============================================================================

/**
 * Role: Application roles (Admin, User, Approver, etc.)
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('security') AND name = 'Role')
BEGIN
  CREATE TABLE security.Role (
    RoleId INT PRIMARY KEY IDENTITY(1,1),
    RoleName NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(500) NOT NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL
  );
END;

/**
 * Permission: Fine-grained permissions
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('security') AND name = 'Permission')
BEGIN
  CREATE TABLE security.Permission (
    PermissionId INT PRIMARY KEY IDENTITY(1,1),
    PermissionName NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(500) NOT NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL
  );
END;

/**
 * RolePermission: Many-to-many mapping
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('security') AND name = 'RolePermission')
BEGIN
  CREATE TABLE security.RolePermission (
    RolePermissionId INT PRIMARY KEY IDENTITY(1,1),
    RoleId INT NOT NULL,
    PermissionId INT NOT NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_RolePermission UNIQUE (RoleId, PermissionId),
    CONSTRAINT FK_RolePermission_Role FOREIGN KEY (RoleId) REFERENCES security.Role(RoleId),
    CONSTRAINT FK_RolePermission_Permission FOREIGN KEY (PermissionId) REFERENCES security.Permission(PermissionId)
  );

  CREATE NONCLUSTERED INDEX IX_RolePermission_RoleId 
    ON security.RolePermission (RoleId) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_RolePermission_PermissionId 
    ON security.RolePermission (PermissionId) WHERE IsDeleted = 0;
END;

/**
 * User: Application user (Azure Entra ID + local allow-list)
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('security') AND name = 'User')
BEGIN
  CREATE TABLE security.[User] (
    UserId NVARCHAR(255) PRIMARY KEY,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    DisplayName NVARCHAR(255) NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    LastSignInOn DATETIME2(7) NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL
  );

  CREATE NONCLUSTERED INDEX IX_User_Email 
    ON security.[User] (Email) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_User_IsActive 
    ON security.[User] (IsActive) WHERE IsDeleted = 0;
END;

/**
 * UserRole: User-to-Role mapping
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('security') AND name = 'UserRole')
BEGIN
  CREATE TABLE security.UserRole (
    UserRoleId BIGINT PRIMARY KEY IDENTITY(1,1),
    UserId NVARCHAR(255) NOT NULL,
    RoleId INT NOT NULL,
    GrantedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    GrantedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_UserRole UNIQUE (UserId, RoleId),
    CONSTRAINT FK_UserRole_User FOREIGN KEY (UserId) REFERENCES security.[User](UserId),
    CONSTRAINT FK_UserRole_Role FOREIGN KEY (RoleId) REFERENCES security.Role(RoleId)
  );

  CREATE NONCLUSTERED INDEX IX_UserRole_UserId 
    ON security.UserRole (UserId) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_UserRole_RoleId 
    ON security.UserRole (RoleId) WHERE IsDeleted = 0;
END;

-- ============================================================================
-- APP SCHEMA (Master data, invoices, PO)
-- ============================================================================

/**
 * Vendor: Supplier master data
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('app') AND name = 'Vendor')
BEGIN
  CREATE TABLE app.Vendor (
    VendorId INT PRIMARY KEY IDENTITY(1,1),
    VendorCode NVARCHAR(50) NOT NULL UNIQUE,
    VendorName NVARCHAR(255) NOT NULL,
    Email NVARCHAR(255) NULL,
    Phone NVARCHAR(20) NULL,
    Address NVARCHAR(MAX) NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL
  );

  CREATE NONCLUSTERED INDEX IX_Vendor_VendorCode 
    ON app.Vendor (VendorCode) WHERE IsDeleted = 0;
END;

/**
 * Buyer: Customer/buyer master data
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('app') AND name = 'Buyer')
BEGIN
  CREATE TABLE app.Buyer (
    BuyerId INT PRIMARY KEY IDENTITY(1,1),
    BuyerCode NVARCHAR(50) NOT NULL UNIQUE,
    BuyerName NVARCHAR(255) NOT NULL,
    Email NVARCHAR(255) NULL,
    Phone NVARCHAR(20) NULL,
    Address NVARCHAR(MAX) NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL
  );

  CREATE NONCLUSTERED INDEX IX_Buyer_BuyerCode 
    ON app.Buyer (BuyerCode) WHERE IsDeleted = 0;
END;

/**
 * Invoice: Invoice header (current state only, history in InvoiceHistory)
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('app') AND name = 'Invoice')
BEGIN
  CREATE TABLE app.Invoice (
    InvoiceId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    InvoiceNumber NVARCHAR(20) NOT NULL UNIQUE, -- SMI-YYYY-MM-NNN format
    InvoiceDate DATETIME2(7) NOT NULL,
    VendorId INT NOT NULL,
    BuyerId INT NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (Status IN ('Draft', 'In Review', 'Approved', 'Shipped')),
    TotalAmount DECIMAL(19,2) NOT NULL DEFAULT 0,
    TaxAmount DECIMAL(19,2) NOT NULL DEFAULT 0,
    FinalAmount DECIMAL(19,2) NOT NULL DEFAULT 0,
    Notes NVARCHAR(MAX) NULL,
    Version INT NOT NULL DEFAULT 1,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL,
    CONSTRAINT FK_Invoice_Vendor FOREIGN KEY (VendorId) REFERENCES app.Vendor(VendorId),
    CONSTRAINT FK_Invoice_Buyer FOREIGN KEY (BuyerId) REFERENCES app.Buyer(BuyerId)
  );

  CREATE NONCLUSTERED INDEX IX_Invoice_InvoiceNumber 
    ON app.Invoice (InvoiceNumber) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_Invoice_Status 
    ON app.Invoice (Status) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_Invoice_CreatedOn 
    ON app.Invoice (CreatedOn DESC) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_Invoice_VendorId 
    ON app.Invoice (VendorId) WHERE IsDeleted = 0;
END;

/**
 * InvoiceHistory: Audit trail for all invoice changes
 * Triggered on every UPDATE to Invoice table
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('app') AND name = 'InvoiceHistory')
BEGIN
  CREATE TABLE app.InvoiceHistory (
    InvoiceHistoryId BIGINT PRIMARY KEY IDENTITY(1,1),
    InvoiceId UNIQUEIDENTIFIER NOT NULL,
    InvoiceNumber NVARCHAR(20) NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    TotalAmount DECIMAL(19,2) NOT NULL,
    TaxAmount DECIMAL(19,2) NOT NULL,
    FinalAmount DECIMAL(19,2) NOT NULL,
    Version INT NOT NULL,
    ChangedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ChangedBy NVARCHAR(255) NOT NULL,
    ChangeType NVARCHAR(10) NOT NULL CHECK (ChangeType IN ('Insert', 'Update', 'Delete')),
    PreviousStatus NVARCHAR(20) NULL,
    PreviousTotalAmount DECIMAL(19,2) NULL
  );

  CREATE NONCLUSTERED INDEX IX_InvoiceHistory_InvoiceId 
    ON app.InvoiceHistory (InvoiceId);
  
  CREATE NONCLUSTERED INDEX IX_InvoiceHistory_ChangedOn 
    ON app.InvoiceHistory (ChangedOn DESC);
END;

/**
 * InvoiceLine: Line items on an invoice
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('app') AND name = 'InvoiceLine')
BEGIN
  CREATE TABLE app.InvoiceLine (
    InvoiceLineId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    InvoiceId UNIQUEIDENTIFIER NOT NULL,
    LineNumber INT NOT NULL,
    Description NVARCHAR(MAX) NOT NULL, -- Stone, size, finish e.g. "GRANITE - 12\" X 24\" Polished"
    Quantity DECIMAL(19,4) NOT NULL,
    UnitOfMeasure NVARCHAR(10) NOT NULL, -- SF, Piece, etc.
    UnitPrice DECIMAL(19,2) NOT NULL,
    Amount DECIMAL(19,2) NOT NULL,
    CrateRanges NVARCHAR(MAX) NULL, -- JSON or comma-separated
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    ModifiedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    ModifiedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL,
    CONSTRAINT FK_InvoiceLine_Invoice FOREIGN KEY (InvoiceId) REFERENCES app.Invoice(InvoiceId)
  );

  CREATE NONCLUSTERED INDEX IX_InvoiceLine_InvoiceId 
    ON app.InvoiceLine (InvoiceId) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_InvoiceLine_LineNumber 
    ON app.InvoiceLine (InvoiceId, LineNumber) WHERE IsDeleted = 0;
END;

/**
 * POImportBatch: Batch of uploaded PO records
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('sales') AND name = 'POImportBatch')
BEGIN
  CREATE TABLE sales.POImportBatch (
    POImportBatchId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    FileName NVARCHAR(255) NOT NULL,
    VendorId INT NOT NULL CONSTRAINT FK_POImportBatch_Vendor REFERENCES app.Vendor(VendorId),
    [RowCount] INT NOT NULL,
    ImportedRowCount INT NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Processing', 'Completed', 'Failed')),
    ErrorMessage NVARCHAR(MAX) NULL,
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    CompletedOn DATETIME2(7) NULL,
    IsDeleted BIT NOT NULL DEFAULT 0,
    RowVersion ROWVERSION NOT NULL
  );

  CREATE NONCLUSTERED INDEX IX_POImportBatch_VendorId 
    ON sales.POImportBatch (VendorId) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_POImportBatch_Status 
    ON sales.POImportBatch (Status) WHERE IsDeleted = 0;
END;

/**
 * POLine: Individual PO line items (from import)
 */
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('sales') AND name = 'POLine')
BEGIN
  CREATE TABLE sales.POLine (
    POLineId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    POImportBatchId UNIQUEIDENTIFIER NOT NULL,
    PONumber NVARCHAR(50) NOT NULL,
    SPSItem NVARCHAR(MAX) NOT NULL,
    SKU NVARCHAR(50) NOT NULL,
    Quantity DECIMAL(19,4) NOT NULL,
    UnitOfMeasure NVARCHAR(10) NOT NULL,
    SOReference NVARCHAR(50) NULL,
    Supplier NVARCHAR(255) NULL,
    ShipTo NVARCHAR(MAX) NULL,
    PODate DATE NULL,
    RawData NVARCHAR(MAX) NULL, -- Original JSON/CSV for audit
    CreatedOn DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy NVARCHAR(255) NOT NULL DEFAULT 'system',
    IsDeleted BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_POLine_POImportBatch FOREIGN KEY (POImportBatchId) REFERENCES sales.POImportBatch(POImportBatchId)
  );

  CREATE NONCLUSTERED INDEX IX_POLine_POImportBatchId 
    ON sales.POLine (POImportBatchId) WHERE IsDeleted = 0;
  
  CREATE NONCLUSTERED INDEX IX_POLine_PONumber 
    ON sales.POLine (PONumber) WHERE IsDeleted = 0;
END;

-- ============================================================================
-- MIGRATION TRACKING TABLE
-- ============================================================================

-- ============================================================================
-- MIGRATION HISTORY TABLE - Created by migration runner
-- (Not needed here - migration runner handles this)
-- ============================================================================

PRINT 'Migration V001__schemas completed successfully';
