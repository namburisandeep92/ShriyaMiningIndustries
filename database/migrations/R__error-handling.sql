/**
 * R__error-handling.sql (Repeatable script - runs on every deployment)
 * 
 * Stored procedure for error logging
 * Called by every other stored procedure in TRY/CATCH block
 * 
 * Idempotent: CREATE OR ALTER
 */

-- ============================================================================
-- usp_ErrorLog_Insert
-- ============================================================================
-- Insert error log entry with SQL Server error context
-- Used in every stored procedure's CATCH block

CREATE OR ALTER PROCEDURE log.usp_ErrorLog_Insert
  @CorrelationId UNIQUEIDENTIFIER,
  @Layer NVARCHAR(20),
  @ErrorCode NVARCHAR(20) = NULL,
  @UserId NVARCHAR(255) = NULL,
  @IpAddress NVARCHAR(45) = NULL,
  @RequestPath NVARCHAR(1024) = NULL,
  @RequestMethod NVARCHAR(10) = NULL,
  @AdditionalContext NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ErrorLogId BIGINT;

  INSERT INTO log.ErrorLog (
    CorrelationId, ErrorCode, Layer, SqlErrorNumber, SqlProcedureName, 
    SqlLineNumber, SqlMessage, StackTrace, UserId, IpAddress, RequestPath, 
    RequestMethod, CreatedOn, CreatedBy
  )
  VALUES (
    @CorrelationId,
    @ErrorCode,
    @Layer,
    ERROR_NUMBER(),
    ERROR_PROCEDURE(),
    ERROR_LINE(),
    ERROR_MESSAGE(),
    @AdditionalContext,
    @UserId,
    @IpAddress,
    @RequestPath,
    @RequestMethod,
    GETUTCDATE(),
    @UserId
  );

  SET @ErrorLogId = SCOPE_IDENTITY();

  SELECT @ErrorLogId AS ErrorLogId, 
         ERROR_NUMBER() AS ErrorNumber, 
         ERROR_MESSAGE() AS ErrorMessage;
END;

PRINT 'Procedure log.usp_ErrorLog_Insert created/altered successfully';
GO

-- ============================================================================
-- usp_ErrorLog_Purge
-- ============================================================================
-- Retention policy: 90 days Info/Warning, 1 year Error/Critical
-- Should be called nightly (or scheduled via GitHub Action for $0 cost)

CREATE OR ALTER PROCEDURE log.usp_ErrorLog_Purge
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @PurgeDate DATETIME2(7);
  DECLARE @RowsDeleted INT = 0;

  -- Soft-delete Info and Warning errors older than 90 days
  SET @PurgeDate = DATEADD(DAY, -90, GETUTCDATE());
  -- log.ErrorLog has no Severity column; severity comes from log.ErrorCode.
  -- Rows with no/unknown ErrorCode are treated as 'Error' (1-year retention).
  UPDATE el
  SET IsDeleted = 1, ModifiedOn = GETUTCDATE()
  FROM log.ErrorLog el
  LEFT JOIN log.ErrorCode ec ON ec.ErrorCode = el.ErrorCode
  WHERE el.IsDeleted = 0
    AND ISNULL(ec.Severity, 'Error') IN ('Info', 'Warning')
    AND el.CreatedOn < @PurgeDate;
  
  SET @RowsDeleted = @@ROWCOUNT;

  -- Soft-delete Error and Critical errors older than 1 year
  SET @PurgeDate = DATEADD(YEAR, -1, GETUTCDATE());
  UPDATE el
  SET IsDeleted = 1, ModifiedOn = GETUTCDATE()
  FROM log.ErrorLog el
  LEFT JOIN log.ErrorCode ec ON ec.ErrorCode = el.ErrorCode
  WHERE el.IsDeleted = 0
    AND ISNULL(ec.Severity, 'Error') IN ('Error', 'Critical')
    AND el.CreatedOn < @PurgeDate;
  
  SET @RowsDeleted = @RowsDeleted + @@ROWCOUNT;

  DECLARE @PurgeMessage NVARCHAR(MAX);
  SET @PurgeMessage = 'Purged ' + CAST(@RowsDeleted AS NVARCHAR(20)) + ' error log rows';
  INSERT INTO log.ApplicationEvent (CorrelationId, EventType, Severity, Message, CreatedOn)
  VALUES (NEWID(), 'ErrorLogPurge', 'Info', 
          @PurgeMessage,
          GETUTCDATE());
END;

PRINT 'Procedure log.usp_ErrorLog_Purge created/altered successfully';
GO

-- ============================================================================
-- usp_Invoice_Create
-- ============================================================================
-- Create new invoice with auto-generated invoice number (SMI-YYYY-MM-NNN)
-- First-write-wins: returns 409 if duplicate invoice number

CREATE OR ALTER PROCEDURE app.usp_Invoice_Create
  @InvoiceDate DATETIME2(7),
  @VendorId INT,
  @BuyerId INT,
  @Notes NVARCHAR(MAX) = NULL,
  @CreatedBy NVARCHAR(255),
  @CorrelationId UNIQUEIDENTIFIER,
  @InvoiceId UNIQUEIDENTIFIER OUTPUT,
  @InvoiceNumber NVARCHAR(20) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  BEGIN TRY
    -- Generate invoice number: SMI-YYYY-MM-NNN
    DECLARE @YearMonth NVARCHAR(7);
    DECLARE @Sequence INT;
    DECLARE @NewInvoiceNumber NVARCHAR(20);

    SET @YearMonth = FORMAT(@InvoiceDate, 'yyyy-MM');
    
    -- Get next sequence for this month
    SELECT @Sequence = COALESCE(MAX(CAST(SUBSTRING(InvoiceNumber, PATINDEX('%-%-%', InvoiceNumber) + 1, 3) AS INT)), 0) + 1
    FROM app.Invoice
    WHERE InvoiceNumber LIKE 'SMI-' + @YearMonth + '-%'
      AND IsDeleted = 0;
    
    SET @NewInvoiceNumber = 'SMI-' + @YearMonth + '-' + RIGHT('000' + CAST(@Sequence AS NVARCHAR(3)), 3);

    -- Check for duplicate (first-write-wins)
    IF EXISTS (SELECT 1 FROM app.Invoice WHERE InvoiceNumber = @NewInvoiceNumber AND IsDeleted = 0)
    BEGIN
      -- Return 409-like error
      DECLARE @DuplicateMessage NVARCHAR(MAX);
      SET @DuplicateMessage = 'Duplicate invoice number: ' + @NewInvoiceNumber;
      INSERT INTO log.ErrorLog (CorrelationId, ErrorCode, Layer, SqlErrorNumber, SqlMessage, CreatedBy, CreatedOn)
      VALUES (@CorrelationId, 'INV-SAVE-409', 'Database', 50409, 
              @DuplicateMessage, @CreatedBy, GETUTCDATE());
      
      THROW 50409, 'Duplicate invoice number', 1;
    END;

    -- Create invoice
    SET @InvoiceId = NEWID();
    SET @InvoiceNumber = @NewInvoiceNumber;

    INSERT INTO app.Invoice (InvoiceId, InvoiceNumber, InvoiceDate, VendorId, BuyerId, 
                             Status, CreatedBy, ModifiedBy, CreatedOn, ModifiedOn)
    VALUES (@InvoiceId, @InvoiceNumber, @InvoiceDate, @VendorId, @BuyerId, 
            'Draft', @CreatedBy, @CreatedBy, GETUTCDATE(), GETUTCDATE());

    -- Log event
    DECLARE @InvoiceCreatedMessage NVARCHAR(MAX);
    SET @InvoiceCreatedMessage = 'Invoice ' + @InvoiceNumber + ' created';
    INSERT INTO log.ApplicationEvent (CorrelationId, EventType, Severity, Message, UserId, CreatedOn)
    VALUES (@CorrelationId, 'InvoiceCreated', 'Info', 
            @InvoiceCreatedMessage, @CreatedBy, GETUTCDATE());

    SELECT @InvoiceId AS InvoiceId, @InvoiceNumber AS InvoiceNumber;
  END TRY
  BEGIN CATCH
    EXEC log.usp_ErrorLog_Insert 
      @CorrelationId = @CorrelationId,
      @Layer = 'Database',
      @ErrorCode = 'INV-SAVE-ERROR',
      @UserId = @CreatedBy;
    
    THROW;
  END CATCH;
END;

PRINT 'Procedure app.usp_Invoice_Create created/altered successfully';
GO

-- ============================================================================
-- usp_Invoice_UpdateStatus
-- ============================================================================
-- Update invoice status with rowversion check (first-write-wins concurrency)
-- Returns 409 if rowversion mismatch

CREATE OR ALTER PROCEDURE app.usp_Invoice_UpdateStatus
  @InvoiceId UNIQUEIDENTIFIER,
  @NewStatus NVARCHAR(20),
  @RowVersion BINARY(8),
  @ModifiedBy NVARCHAR(255),
  @CorrelationId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  BEGIN TRY
    DECLARE @CurrentStatus NVARCHAR(20);
    DECLARE @CurrentRowVersion BINARY(8);

    -- Check if invoice exists and get current state
    SELECT @CurrentStatus = Status, @CurrentRowVersion = RowVersion
    FROM app.Invoice
    WHERE InvoiceId = @InvoiceId AND IsDeleted = 0;

    IF @CurrentStatus IS NULL
    BEGIN
      THROW 50404, 'Invoice not found', 1;
    END;

    -- First-write-wins: check rowversion
    IF @RowVersion <> @CurrentRowVersion
    BEGIN
      DECLARE @ErrorMessage NVARCHAR(MAX);
      SET @ErrorMessage = 'Concurrent modification detected for invoice ' + CAST(@InvoiceId AS NVARCHAR(36));
      INSERT INTO log.ErrorLog (CorrelationId, ErrorCode, Layer, SqlErrorNumber, SqlMessage, CreatedBy, CreatedOn)
      VALUES (@CorrelationId, 'INV-UPDATE-409', 'Database', 50409, 
              @ErrorMessage, 
              @ModifiedBy, GETUTCDATE());
      
      THROW 50409, 'Concurrent modification: invoice was updated by another user', 1;
    END;

    -- Validate status transition
    IF @CurrentStatus = 'Draft' AND @NewStatus NOT IN ('In Review')
       OR @CurrentStatus = 'In Review' AND @NewStatus NOT IN ('Approved')
       OR @CurrentStatus = 'Approved' AND @NewStatus NOT IN ('Shipped')
    BEGIN
      THROW 50400, 'Invalid status transition from ' + @CurrentStatus + ' to ' + @NewStatus, 1;
    END;

    -- Record history before update
    INSERT INTO app.InvoiceHistory (InvoiceId, InvoiceNumber, Status, TotalAmount, TaxAmount, 
                                     FinalAmount, Version, ChangedBy, ChangeType, PreviousStatus)
    SELECT InvoiceId, InvoiceNumber, Status, TotalAmount, TaxAmount, FinalAmount, Version, 
           @ModifiedBy, 'Update', @CurrentStatus
    FROM app.Invoice
    WHERE InvoiceId = @InvoiceId;

    -- Update invoice
    UPDATE app.Invoice
    SET Status = @NewStatus, 
        ModifiedBy = @ModifiedBy, 
        ModifiedOn = GETUTCDATE(),
        Version = Version + 1
    WHERE InvoiceId = @InvoiceId;

    DECLARE @StatusChangeMessage NVARCHAR(MAX);
    SET @StatusChangeMessage = 'Invoice status changed from ' + @CurrentStatus + ' to ' + @NewStatus;
    INSERT INTO log.ApplicationEvent (CorrelationId, EventType, Severity, Message, UserId, CreatedOn)
    VALUES (@CorrelationId, 'InvoiceStatusChanged', 'Info', 
            @StatusChangeMessage, 
            @ModifiedBy, GETUTCDATE());

    SELECT 'Status updated successfully' AS Result;
  END TRY
  BEGIN CATCH
    EXEC log.usp_ErrorLog_Insert 
      @CorrelationId = @CorrelationId,
      @Layer = 'Database',
      @ErrorCode = 'INV-UPDATE-ERROR',
      @UserId = @ModifiedBy;
    
    THROW;
  END CATCH;
END;

PRINT 'Procedure app.usp_Invoice_UpdateStatus created/altered successfully';
GO

-- ============================================================================
-- usp_Invoice_GetVersionHistory
-- ============================================================================
-- Retrieve all versions of an invoice for audit/reprint

CREATE OR ALTER PROCEDURE app.usp_Invoice_GetVersionHistory
  @InvoiceId UNIQUEIDENTIFIER,
  @CorrelationId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  BEGIN TRY
    -- Check if invoice exists
    IF NOT EXISTS (SELECT 1 FROM app.Invoice WHERE InvoiceId = @InvoiceId AND IsDeleted = 0)
    BEGIN
      THROW 50404, 'Invoice not found', 1;
    END;

    -- Return version history
    SELECT InvoiceHistoryId, InvoiceId, InvoiceNumber, Status, TotalAmount, TaxAmount, 
           FinalAmount, Version, ChangedOn, ChangedBy, ChangeType, 
           PreviousStatus, PreviousTotalAmount
    FROM app.InvoiceHistory
    WHERE InvoiceId = @InvoiceId
    ORDER BY Version DESC;
  END TRY
  BEGIN CATCH
    EXEC log.usp_ErrorLog_Insert 
      @CorrelationId = @CorrelationId,
      @Layer = 'Database',
      @ErrorCode = 'INV-QUERY-ERROR';
    
    THROW;
  END CATCH;
END;

PRINT 'Procedure app.usp_Invoice_GetVersionHistory created/altered successfully';
GO
