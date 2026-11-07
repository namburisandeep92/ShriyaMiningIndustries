CREATE OR ALTER VIEW app.vInvoiceDetails AS
SELECT i.*, v.VendorName, b.BuyerName
FROM app.Invoice i WITH(UPDLOCK,HOLDLOCK)
JOIN app.Vendor v ON i.VendorId=v.VendorId
JOIN app.Buyer b ON i.BuyerId=b.BuyerId;
GO
CREATE OR ALTER VIEW app.vInvoiceLines AS
SELECT InvoiceId, InvoiceLineId AS LineId, LineNumber, Description, Quantity,
       UnitPrice AS Rate, Amount AS LineAmount, TaxRate, TaxAmount AS Tax,
       UnitOfMeasure, CrateRanges
FROM app.InvoiceLine WHERE IsDeleted=0;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_SaveSnapshot @InvoiceId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO app.InvoiceSnapshot (InvoiceId,Version,HeaderJson,LinesJson)
  SELECT i.InvoiceId,i.Version,
    (SELECT d.* FROM app.vInvoiceDetails d WHERE d.InvoiceId=i.InvoiceId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
    (SELECT l.* FROM app.vInvoiceLines l WHERE l.InvoiceId=i.InvoiceId ORDER BY LineNumber FOR JSON PATH)
  FROM app.Invoice i
  WHERE i.InvoiceId=@InvoiceId
    AND NOT EXISTS (SELECT 1 FROM app.InvoiceSnapshot s WHERE s.InvoiceId=i.InvoiceId AND s.Version=i.Version);
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_GetById
  @InvoiceId UNIQUEIDENTIFIER, @CorrelationId UNIQUEIDENTIFIER=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM app.vInvoiceDetails WHERE InvoiceId=@InvoiceId AND IsDeleted=0;
  SELECT * FROM app.vInvoiceLines WHERE InvoiceId=@InvoiceId ORDER BY LineNumber;
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_GetList
  @CorrelationId UNIQUEIDENTIFIER=NULL, @Status NVARCHAR(20)=NULL,
  @VendorId INT=NULL, @BuyerId INT=NULL, @PageNum INT=1, @PageSize INT=50,
  @SortBy NVARCHAR(30)='CreatedOn', @SortOrder NVARCHAR(4)='desc', @Search NVARCHAR(255)=NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @PageNum<1 OR @PageSize<1 OR @PageSize>100 OR @SortBy NOT IN ('CreatedOn','InvoiceNumber','TotalAmount')
     OR @SortOrder NOT IN ('asc','desc') THROW 50400, 'Invalid paging or sort parameters', 1;
  SELECT * INTO #Invoices FROM app.vInvoiceDetails
  WHERE IsDeleted=0 AND (@Status IS NULL OR Status=@Status)
    AND (@VendorId IS NULL OR VendorId=@VendorId) AND (@BuyerId IS NULL OR BuyerId=@BuyerId)
    AND (@Search IS NULL OR CHARINDEX(@Search,InvoiceNumber)>0 OR CHARINDEX(@Search,COALESCE(PONumber,''))>0);
  SELECT * FROM #Invoices
  ORDER BY
    CASE WHEN @SortBy='CreatedOn' AND @SortOrder='asc' THEN CreatedOn END ASC,
    CASE WHEN @SortBy='CreatedOn' AND @SortOrder='desc' THEN CreatedOn END DESC,
    CASE WHEN @SortBy='InvoiceNumber' AND @SortOrder='asc' THEN InvoiceNumber END ASC,
    CASE WHEN @SortBy='InvoiceNumber' AND @SortOrder='desc' THEN InvoiceNumber END DESC,
    CASE WHEN @SortBy='TotalAmount' AND @SortOrder='asc' THEN FinalAmount END ASC,
    CASE WHEN @SortBy='TotalAmount' AND @SortOrder='desc' THEN FinalAmount END DESC,
    InvoiceId
  OFFSET (CONVERT(BIGINT,@PageNum)-1)*@PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
  SELECT COUNT(*) AS TotalCount FROM #Invoices;
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_Create
  @InvoiceDate DATETIME2(7), @VendorId INT, @BuyerId INT, @Notes NVARCHAR(MAX)=NULL,
  @CreatedBy NVARCHAR(255)=NULL, @CorrelationId UNIQUEIDENTIFIER=NULL,
  @InvoiceId UNIQUEIDENTIFIER=NULL OUTPUT, @InvoiceNumber NVARCHAR(20)=NULL OUTPUT,
  @ItemsJson NVARCHAR(MAX)=NULL, @CreatedByEmail NVARCHAR(255)=NULL, @PONumber NVARCHAR(MAX)=NULL,
  @DocumentJson NVARCHAR(MAX)=NULL,@RequestedInvoiceNumber NVARCHAR(20)=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET @CreatedBy=COALESCE(@CreatedByEmail,@CreatedBy);
  IF @CreatedBy IS NULL OR @InvoiceDate IS NULL THROW 50400, 'Invoice date and creator are required', 1;
  IF NOT EXISTS(SELECT 1 FROM app.Vendor WHERE VendorId=@VendorId AND IsDeleted=0)
     OR NOT EXISTS(SELECT 1 FROM app.Buyer WHERE BuyerId=@BuyerId AND IsDeleted=0)
     THROW 50400, 'Vendor or buyer is invalid', 1;
  IF @ItemsJson IS NOT NULL AND (ISJSON(@ItemsJson)<>1 OR LEFT(LTRIM(@ItemsJson),1)<>'[')
    THROW 50400, 'Items must be a JSON array', 1;
  IF @DocumentJson IS NOT NULL AND ISJSON(@DocumentJson)<>1 THROW 50400, 'Invalid invoice document', 1;
  BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @Prefix NVARCHAR(12)='SMI-'+CONVERT(NVARCHAR(7),@InvoiceDate,126)+'-';
    DECLARE @Sequence INT;
    IF NULLIF(LTRIM(RTRIM(@RequestedInvoiceNumber)),'') IS NULL
    BEGIN
      SELECT @Sequence=COALESCE(MAX(TRY_CONVERT(INT,SUBSTRING(InvoiceNumber,13,8))),0)+1
      FROM app.Invoice WITH (UPDLOCK,HOLDLOCK) WHERE InvoiceNumber LIKE @Prefix+'%';
      IF @Sequence>999 THROW 50409, 'Monthly invoice sequence exhausted', 1;
    END;
    SET @InvoiceId=NEWID();
    SET @InvoiceNumber=COALESCE(NULLIF(LTRIM(RTRIM(@RequestedInvoiceNumber)),''),@Prefix+RIGHT('000'+CONVERT(NVARCHAR(3),@Sequence),3));
    INSERT INTO app.Invoice (InvoiceId,InvoiceNumber,InvoiceDate,VendorId,BuyerId,Notes,PONumber,DocumentJson,CreatedBy,ModifiedBy)
      VALUES(@InvoiceId,@InvoiceNumber,@InvoiceDate,@VendorId,@BuyerId,@Notes,@PONumber,@DocumentJson,@CreatedBy,@CreatedBy);
    IF @ItemsJson IS NOT NULL
    BEGIN
      INSERT INTO app.InvoiceLine (InvoiceId,LineNumber,Description,Quantity,UnitOfMeasure,UnitPrice,Amount,TaxRate,TaxAmount,CreatedBy,ModifiedBy)
      SELECT @InvoiceId,CONVERT(INT,j.[key])+1,x.description,x.quantity,COALESCE(x.unitOfMeasure,'SF'),
             x.rate,ROUND(x.quantity*x.rate,2),x.taxRate,ROUND(ROUND(x.quantity*x.rate,2)*x.taxRate/100,2),@CreatedBy,@CreatedBy
      FROM OPENJSON(@ItemsJson) j CROSS APPLY OPENJSON(j.value) WITH
        (description NVARCHAR(MAX),quantity DECIMAL(19,4),rate DECIMAL(19,6),taxRate DECIMAL(9,4),unitOfMeasure NVARCHAR(10)) x;
      IF NOT EXISTS(SELECT 1 FROM app.InvoiceLine WHERE InvoiceId=@InvoiceId)
         OR EXISTS(SELECT 1 FROM app.InvoiceLine WHERE InvoiceId=@InvoiceId AND (Quantity<=0 OR UnitPrice<0 OR TaxRate<0 OR TaxRate>100))
         THROW 50400, 'Invalid invoice lines', 1;
      UPDATE app.Invoice SET TotalAmount=t.Amount,TaxAmount=t.Tax,FinalAmount=t.Amount+t.Tax
      FROM app.Invoice i CROSS APPLY (SELECT SUM(Amount) Amount,SUM(TaxAmount) Tax FROM app.InvoiceLine WHERE InvoiceId=i.InvoiceId) t
      WHERE i.InvoiceId=@InvoiceId;
    END;
    EXEC app.usp_Invoice_SaveSnapshot @InvoiceId;
    COMMIT;
    EXEC app.usp_Invoice_GetById @InvoiceId,@CorrelationId;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_Update
  @InvoiceId UNIQUEIDENTIFIER, @CurrentRowVersion BINARY(8), @ModifiedByEmail NVARCHAR(255),
  @CorrelationId UNIQUEIDENTIFIER=NULL, @ItemsJson NVARCHAR(MAX)=NULL,
  @Status NVARCHAR(20)=NULL, @Notes NVARCHAR(MAX)=NULL, @NotesProvided BIT=0,
  @DocumentJson NVARCHAR(MAX)=NULL,@InvoiceDate DATETIME2=NULL,@PONumber NVARCHAR(MAX)=NULL,
  @RequestedInvoiceNumber NVARCHAR(20)=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF @CurrentRowVersion IS NULL THROW 50400, 'Row version is required', 1;
  IF @ItemsJson IS NOT NULL AND (ISJSON(@ItemsJson)<>1 OR LEFT(LTRIM(@ItemsJson),1)<>'[')
    THROW 50400, 'Items must be a JSON array', 1;
  IF @DocumentJson IS NOT NULL AND ISJSON(@DocumentJson)<>1 THROW 50400, 'Invalid invoice document', 1;
  BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @OldStatus NVARCHAR(20),@ActualVersion BINARY(8);
    SELECT @OldStatus=Status,@ActualVersion=RowVersion FROM app.Invoice WITH(UPDLOCK,HOLDLOCK)
    WHERE InvoiceId=@InvoiceId AND IsDeleted=0;
    IF @OldStatus IS NULL THROW 50404, 'Invoice not found', 1;
    IF @ActualVersion<>@CurrentRowVersion THROW 50409, 'Invoice was modified by another user', 1;
    IF @Status IS NOT NULL AND @Status<>@OldStatus AND NOT
      ((@OldStatus='Draft' AND @Status='In Review') OR (@OldStatus='In Review' AND @Status='Approved')
       OR (@OldStatus='Approved' AND @Status='Shipped'))
      THROW 50400, 'Invalid invoice status transition', 1;
    EXEC app.usp_Invoice_SaveSnapshot @InvoiceId;
    INSERT INTO app.InvoiceHistory (InvoiceId,InvoiceNumber,Status,TotalAmount,TaxAmount,FinalAmount,Version,ChangedBy,ChangeType)
    SELECT InvoiceId,InvoiceNumber,Status,TotalAmount,TaxAmount,FinalAmount,Version,@ModifiedByEmail,'Update'
    FROM app.Invoice WHERE InvoiceId=@InvoiceId;
    IF @ItemsJson IS NOT NULL
    BEGIN
      UPDATE app.InvoiceLine SET IsDeleted=1,ModifiedBy=@ModifiedByEmail,ModifiedOn=SYSUTCDATETIME() WHERE InvoiceId=@InvoiceId AND IsDeleted=0;
      INSERT INTO app.InvoiceLine (InvoiceId,LineNumber,Description,Quantity,UnitOfMeasure,UnitPrice,Amount,TaxRate,TaxAmount,CreatedBy,ModifiedBy)
      SELECT @InvoiceId,CONVERT(INT,j.[key])+1,x.description,x.quantity,COALESCE(x.unitOfMeasure,'SF'),
             x.rate,ROUND(x.quantity*x.rate,2),x.taxRate,ROUND(ROUND(x.quantity*x.rate,2)*x.taxRate/100,2),@ModifiedByEmail,@ModifiedByEmail
      FROM OPENJSON(@ItemsJson) j CROSS APPLY OPENJSON(j.value) WITH
        (description NVARCHAR(MAX),quantity DECIMAL(19,4),rate DECIMAL(19,6),taxRate DECIMAL(9,4),unitOfMeasure NVARCHAR(10)) x;
      IF NOT EXISTS(SELECT 1 FROM app.InvoiceLine WHERE InvoiceId=@InvoiceId AND IsDeleted=0)
         OR EXISTS(SELECT 1 FROM app.InvoiceLine WHERE InvoiceId=@InvoiceId AND IsDeleted=0 AND (Quantity<=0 OR UnitPrice<0 OR TaxRate<0 OR TaxRate>100))
         THROW 50400, 'Invalid invoice lines', 1;
    END;
    UPDATE app.Invoice SET Status=COALESCE(@Status,Status),
      DocumentJson=COALESCE(@DocumentJson,DocumentJson),
      InvoiceDate=COALESCE(@InvoiceDate,InvoiceDate),
      PONumber=CASE WHEN @DocumentJson IS NOT NULL THEN @PONumber ELSE PONumber END,
      InvoiceNumber=COALESCE(@RequestedInvoiceNumber,InvoiceNumber),
      Notes=CASE WHEN @NotesProvided=1 THEN @Notes ELSE Notes END,
      TotalAmount=COALESCE(t.Amount,0),TaxAmount=COALESCE(t.Tax,0),FinalAmount=COALESCE(t.Amount+t.Tax,0),
      ModifiedBy=@ModifiedByEmail,ModifiedOn=SYSUTCDATETIME(),Version=Version+1
    FROM app.Invoice i CROSS APPLY (SELECT SUM(Amount) Amount,SUM(TaxAmount) Tax FROM app.InvoiceLine WHERE InvoiceId=i.InvoiceId AND IsDeleted=0) t
    WHERE i.InvoiceId=@InvoiceId;
    EXEC app.usp_Invoice_SaveSnapshot @InvoiceId;
    COMMIT;
    EXEC app.usp_Invoice_GetById @InvoiceId,@CorrelationId;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_UpdateStatus
  @InvoiceId UNIQUEIDENTIFIER,@NewStatus NVARCHAR(20),@RowVersion BINARY(8),
  @ModifiedBy NVARCHAR(255),@CorrelationId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  EXEC app.usp_Invoice_Update @InvoiceId=@InvoiceId,@CurrentRowVersion=@RowVersion,
    @ModifiedByEmail=@ModifiedBy,@CorrelationId=@CorrelationId,@Status=@NewStatus;
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_Delete
  @InvoiceId UNIQUEIDENTIFIER,@DeletedByEmail NVARCHAR(255),@CorrelationId UNIQUEIDENTIFIER=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRANSACTION;
    IF NOT EXISTS(SELECT 1 FROM app.Invoice WITH(UPDLOCK,HOLDLOCK) WHERE InvoiceId=@InvoiceId AND IsDeleted=0)
      THROW 50404, 'Invoice not found', 1;
    EXEC app.usp_Invoice_SaveSnapshot @InvoiceId;
    INSERT INTO app.InvoiceHistory (InvoiceId,InvoiceNumber,Status,TotalAmount,TaxAmount,FinalAmount,Version,ChangedBy,ChangeType)
    SELECT InvoiceId,InvoiceNumber,Status,TotalAmount,TaxAmount,FinalAmount,Version,@DeletedByEmail,'Delete'
    FROM app.Invoice WHERE InvoiceId=@InvoiceId;
    UPDATE app.Invoice SET IsDeleted=1,ModifiedBy=@DeletedByEmail,ModifiedOn=SYSUTCDATETIME() WHERE InvoiceId=@InvoiceId;
    UPDATE app.InvoiceLine SET IsDeleted=1,ModifiedBy=@DeletedByEmail,ModifiedOn=SYSUTCDATETIME() WHERE InvoiceId=@InvoiceId;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_GetHistory
  @InvoiceId UNIQUEIDENTIFIER,@CorrelationId UNIQUEIDENTIFIER=NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM app.Invoice WHERE InvoiceId=@InvoiceId AND IsDeleted=0) THROW 50404, 'Invoice not found', 1;
  SELECT s.Version,JSON_VALUE(s.HeaderJson,'$.InvoiceNumber') InvoiceNumber,
    JSON_VALUE(s.HeaderJson,'$.Status') Status,
    TRY_CONVERT(DECIMAL(19,2),JSON_VALUE(s.HeaderJson,'$.FinalAmount')) TotalAmount,
    TRY_CONVERT(DATETIME2,JSON_VALUE(s.HeaderJson,'$.ModifiedOn')) ModifiedOn,
    JSON_VALUE(s.HeaderJson,'$.ModifiedBy') ModifiedBy,
    CONCAT('Version ',s.Version) ChangeDescription
  FROM app.InvoiceSnapshot s WHERE InvoiceId=@InvoiceId ORDER BY Version DESC;
END;
GO
CREATE OR ALTER PROCEDURE app.usp_Invoice_GetVersion
  @InvoiceId UNIQUEIDENTIFIER,@Version INT,@CorrelationId UNIQUEIDENTIFIER=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT h.* FROM app.InvoiceSnapshot s JOIN app.Invoice i ON i.InvoiceId=s.InvoiceId AND i.IsDeleted=0
  CROSS APPLY OPENJSON(s.HeaderJson) WITH (
    InvoiceId UNIQUEIDENTIFIER,InvoiceNumber NVARCHAR(20),InvoiceDate DATETIME2,PONumber NVARCHAR(MAX),
    VendorId INT,BuyerId INT,VendorName NVARCHAR(255),BuyerName NVARCHAR(255),Status NVARCHAR(20),
    TotalAmount DECIMAL(19,2),TaxAmount DECIMAL(19,2),FinalAmount DECIMAL(19,2),Notes NVARCHAR(MAX),
    Version INT,CreatedOn DATETIME2,CreatedBy NVARCHAR(255),ModifiedOn DATETIME2,ModifiedBy NVARCHAR(255),
    DocumentJson NVARCHAR(MAX)
  ) h WHERE s.InvoiceId=@InvoiceId AND s.Version=@Version;
  SELECT l.* FROM app.InvoiceSnapshot s JOIN app.Invoice i ON i.InvoiceId=s.InvoiceId AND i.IsDeleted=0
  CROSS APPLY OPENJSON(s.LinesJson) WITH (
    LineId UNIQUEIDENTIFIER,LineNumber INT,Description NVARCHAR(MAX),Quantity DECIMAL(19,4),
    Rate DECIMAL(19,6),LineAmount DECIMAL(19,2),TaxRate DECIMAL(9,4),Tax DECIMAL(19,2),UnitOfMeasure NVARCHAR(10)
  ) l WHERE s.InvoiceId=@InvoiceId AND s.Version=@Version ORDER BY l.LineNumber;
END;
GO
CREATE OR ALTER PROCEDURE sales.usp_POImport_Create
  @VendorId INT,@PONumber NVARCHAR(50),@ImportedByEmail NVARCHAR(255),
  @RowsJson NVARCHAR(MAX),@CorrelationId UNIQUEIDENTIFIER=NULL,@FileName NVARCHAR(255)=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF ISJSON(@RowsJson)<>1 OR LEFT(LTRIM(@RowsJson),1)<>'[' THROW 50400, 'Rows must be a JSON array', 1;
  IF NOT EXISTS(SELECT 1 FROM app.Vendor WHERE VendorId=@VendorId AND IsDeleted=0) THROW 50400, 'Invalid vendor', 1;
  DECLARE @Count INT=(SELECT COUNT(*) FROM OPENJSON(@RowsJson)),@Id UNIQUEIDENTIFIER=NEWID();
  IF @Count=0 OR NULLIF(@PONumber,'') IS NULL THROW 50400, 'PO number and rows are required', 1;
  BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO sales.POImportBatch (POImportBatchId,VendorId,PONumber,FileName,[RowCount],ImportedRowCount,Status,CreatedBy,CompletedOn)
    VALUES(@Id,@VendorId,@PONumber,COALESCE(@FileName,@PONumber+'.xlsx'),@Count,@Count,'Completed',@ImportedByEmail,SYSUTCDATETIME());
    INSERT INTO sales.POLine (POImportBatchId,PONumber,SPSItem,SKU,Quantity,UnitOfMeasure,RawData,CreatedBy)
    SELECT @Id,@PONumber,x.description,x.productCode,x.quantity,COALESCE(x.unitOfMeasure,'SF'),j.value,@ImportedByEmail
    FROM OPENJSON(@RowsJson) j CROSS APPLY OPENJSON(j.value) WITH
      (description NVARCHAR(MAX),productCode NVARCHAR(50),quantity DECIMAL(19,4),unitOfMeasure NVARCHAR(10)) x;
    IF EXISTS(SELECT 1 FROM sales.POLine WHERE POImportBatchId=@Id AND Quantity<=0) THROW 50400, 'Invalid PO quantities', 1;
    COMMIT;
    SELECT @Id ImportId,'Completed' Status,@Count RowsImported;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE sales.usp_POImport_GetList
  @CorrelationId UNIQUEIDENTIFIER=NULL,@VendorId INT=NULL,@Status NVARCHAR(20)=NULL,@PageNum INT=1,@PageSize INT=50
AS
BEGIN
  SET NOCOUNT ON;
  IF @PageNum<1 OR @PageSize<1 OR @PageSize>100 THROW 50400, 'Invalid paging', 1;
  SELECT POImportBatchId ImportId,VendorId,PONumber,Status,ImportedRowCount RowsImported,CreatedBy,CreatedOn
  INTO #Imports FROM sales.POImportBatch WHERE IsDeleted=0 AND (@VendorId IS NULL OR VendorId=@VendorId) AND (@Status IS NULL OR Status=@Status);
  SELECT * FROM #Imports ORDER BY CreatedOn DESC,ImportId
    OFFSET (CONVERT(BIGINT,@PageNum)-1)*@PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
  SELECT COUNT(*) TotalCount FROM #Imports;
END;
GO
CREATE OR ALTER PROCEDURE security.usp_User_GetList
  @CorrelationId UNIQUEIDENTIFIER=NULL,@Role NVARCHAR(100)=NULL,@Status NVARCHAR(20)=NULL,@PageNum INT=1,@PageSize INT=50
AS
BEGIN
  SET NOCOUNT ON;
  IF @PageNum<1 OR @PageSize<1 OR @PageSize>100 THROW 50400, 'Invalid paging', 1;
  SELECT u.UserId,u.Email,u.DisplayName Name,u.IsActive,CASE WHEN u.IsActive=1 THEN 'active' ELSE 'inactive' END Status,
    u.CreatedOn,u.LastSignInOn LastLogin,
    (SELECT STRING_AGG(r.RoleName,',') FROM security.UserRole ur JOIN security.Role r ON r.RoleId=ur.RoleId
     WHERE ur.UserId=u.UserId AND ur.IsDeleted=0 AND r.IsDeleted=0) Roles
  INTO #Users FROM security.[User] u WHERE u.IsDeleted=0
    AND (@Status IS NULL OR (@Status='active' AND u.IsActive=1) OR (@Status='inactive' AND u.IsActive=0))
    AND (@Role IS NULL OR EXISTS(SELECT 1 FROM security.UserRole ur JOIN security.Role r ON r.RoleId=ur.RoleId
      WHERE ur.UserId=u.UserId AND ur.IsDeleted=0 AND r.IsDeleted=0 AND r.RoleName=@Role));
  SELECT * FROM #Users ORDER BY Email,UserId OFFSET (CONVERT(BIGINT,@PageNum)-1)*@PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
  SELECT COUNT(*) TotalCount FROM #Users;
END;
GO
CREATE OR ALTER PROCEDURE security.usp_User_Create
  @Email NVARCHAR(255),@Name NVARCHAR(255),@CreatedByEmail NVARCHAR(255),
  @CorrelationId UNIQUEIDENTIFIER=NULL,@RolesJson NVARCHAR(MAX)='[]'
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF ISJSON(@RolesJson)<>1 OR LEFT(LTRIM(@RolesJson),1)<>'[' THROW 50400, 'Roles must be a JSON array', 1;
  IF EXISTS(SELECT 1 FROM OPENJSON(@RolesJson) j WHERE NOT EXISTS(SELECT 1 FROM security.Role r WHERE r.RoleName=j.value AND r.IsDeleted=0))
    THROW 50400, 'Unknown role', 1;
  BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS(SELECT 1 FROM security.[User] WITH(UPDLOCK,HOLDLOCK) WHERE Email=@Email) THROW 50409, 'User already exists', 1;
    DECLARE @Id NVARCHAR(255)=CONVERT(NVARCHAR(36),NEWID());
    INSERT INTO security.[User] (UserId,Email,DisplayName,CreatedBy,ModifiedBy) VALUES(@Id,@Email,@Name,@CreatedByEmail,@CreatedByEmail);
    INSERT INTO security.UserRole (UserId,RoleId,GrantedBy)
      SELECT DISTINCT @Id,r.RoleId,@CreatedByEmail FROM OPENJSON(@RolesJson) j JOIN security.Role r ON r.RoleName=j.value AND r.IsDeleted=0;
    COMMIT;
    SELECT UserId,Email,DisplayName Name,IsActive,CreatedOn,
      (SELECT STRING_AGG(r.RoleName,',') FROM security.UserRole ur JOIN security.Role r ON r.RoleId=ur.RoleId
       WHERE ur.UserId=@Id AND ur.IsDeleted=0 AND r.IsDeleted=0) Roles
    FROM security.[User] WHERE UserId=@Id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE security.usp_User_AssignRole
  @UserId NVARCHAR(255),@RoleName NVARCHAR(100),@GrantedBy NVARCHAR(255),@CorrelationId UNIQUEIDENTIFIER=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  DECLARE @RoleId INT=(SELECT RoleId FROM security.Role WHERE RoleName=@RoleName AND IsDeleted=0);
  IF @RoleId IS NULL THROW 50400, 'Unknown role', 1;
  BEGIN TRY
    BEGIN TRANSACTION;
    IF NOT EXISTS(SELECT 1 FROM security.[User] WITH(UPDLOCK,HOLDLOCK) WHERE UserId=@UserId AND IsActive=1 AND IsDeleted=0) THROW 50404, 'User not found', 1;
    UPDATE security.UserRole WITH(UPDLOCK,HOLDLOCK) SET IsDeleted=0,GrantedBy=@GrantedBy,GrantedOn=SYSUTCDATETIME()
      WHERE UserId=@UserId AND RoleId=@RoleId;
    IF @@ROWCOUNT=0 INSERT INTO security.UserRole (UserId,RoleId,GrantedBy) VALUES(@UserId,@RoleId,@GrantedBy);
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE security.usp_User_Delete
  @UserId NVARCHAR(255),@ModifiedByEmail NVARCHAR(255),@CorrelationId UNIQUEIDENTIFIER=NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS(SELECT 1 FROM security.[User] WHERE UserId=@UserId AND Email=@ModifiedByEmail) THROW 50400, 'Cannot delete your own account', 1;
    UPDATE security.[User] SET IsDeleted=1,IsActive=0,ModifiedBy=@ModifiedByEmail,ModifiedOn=SYSUTCDATETIME()
      WHERE UserId=@UserId AND IsDeleted=0;
    IF @@ROWCOUNT=0 THROW 50404, 'User not found', 1;
    UPDATE security.UserRole SET IsDeleted=1 WHERE UserId=@UserId;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE log.usp_ErrorLog_GetList
  @CorrelationId UNIQUEIDENTIFIER=NULL,@ErrorCode NVARCHAR(25)=NULL,@UserId NVARCHAR(255)=NULL,
  @FromDate DATETIME2=NULL,@ToDate DATETIME2=NULL,@PageNum INT=1,@PageSize INT=50,
  @Search NVARCHAR(255)=NULL,@Severity NVARCHAR(20)=NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @PageNum<1 OR @PageSize<1 OR @PageSize>100 THROW 50400, 'Invalid paging', 1;
  SELECT e.ErrorLogId,e.ErrorCode,c.Title,c.UserMessage,e.SqlMessage TechnicalMessage,
    e.UserId,e.CorrelationId,e.RequestPath Endpoint,e.CreatedOn Timestamp,COALESCE(c.Severity,'Error') Severity,e.StackTrace,e.Layer
  INTO #Errors FROM log.ErrorLog e LEFT JOIN log.ErrorCode c ON c.ErrorCode=e.ErrorCode
  WHERE e.IsDeleted=0 AND (@ErrorCode IS NULL OR e.ErrorCode=@ErrorCode) AND (@UserId IS NULL OR e.UserId=@UserId)
    AND (@FromDate IS NULL OR e.CreatedOn>=@FromDate) AND (@ToDate IS NULL OR e.CreatedOn<=@ToDate)
    AND (@Severity IS NULL OR COALESCE(c.Severity,'Error')=@Severity)
    AND (@Search IS NULL OR CHARINDEX(@Search,COALESCE(e.SqlMessage,''))>0 OR CHARINDEX(@Search,COALESCE(e.ErrorCode,''))>0);
  SELECT * FROM #Errors ORDER BY Timestamp DESC,ErrorLogId DESC
    OFFSET (CONVERT(BIGINT,@PageNum)-1)*@PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
  SELECT COUNT(*) TotalCount FROM #Errors;
END;
GO
-- Capture current versions once; historical line details cannot be reconstructed.
DECLARE @InvoiceId UNIQUEIDENTIFIER;
DECLARE invoices CURSOR LOCAL FAST_FORWARD FOR SELECT InvoiceId FROM app.Invoice WHERE IsDeleted=0;
OPEN invoices;
FETCH NEXT FROM invoices INTO @InvoiceId;
WHILE @@FETCH_STATUS=0
BEGIN
  EXEC app.usp_Invoice_SaveSnapshot @InvoiceId;
  FETCH NEXT FROM invoices INTO @InvoiceId;
END;
CLOSE invoices;
DEALLOCATE invoices;
