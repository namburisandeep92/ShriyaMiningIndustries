IF COL_LENGTH('app.Vendor', 'AddressLine1') IS NULL ALTER TABLE app.Vendor ADD AddressLine1 NVARCHAR(255) NULL;
IF COL_LENGTH('app.Vendor', 'AddressLine2') IS NULL ALTER TABLE app.Vendor ADD AddressLine2 NVARCHAR(255) NULL;
IF COL_LENGTH('app.Vendor', 'AddressLine3') IS NULL ALTER TABLE app.Vendor ADD AddressLine3 NVARCHAR(255) NULL;
IF COL_LENGTH('app.Vendor', 'LegalName') IS NULL ALTER TABLE app.Vendor ADD LegalName NVARCHAR(255) NULL;
IF COL_LENGTH('app.Vendor', 'City') IS NULL ALTER TABLE app.Vendor ADD City NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'District') IS NULL ALTER TABLE app.Vendor ADD District NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'State') IS NULL ALTER TABLE app.Vendor ADD State NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'PINCode') IS NULL ALTER TABLE app.Vendor ADD PINCode NVARCHAR(20) NULL;
IF COL_LENGTH('app.Vendor', 'Country') IS NULL ALTER TABLE app.Vendor ADD Country NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'Website') IS NULL ALTER TABLE app.Vendor ADD Website NVARCHAR(255) NULL;
IF COL_LENGTH('app.Vendor', 'GSTIN') IS NULL ALTER TABLE app.Vendor ADD GSTIN NVARCHAR(50) NULL;
IF COL_LENGTH('app.Vendor', 'IEC') IS NULL ALTER TABLE app.Vendor ADD IEC NVARCHAR(50) NULL;
IF COL_LENGTH('app.Vendor', 'PAN') IS NULL ALTER TABLE app.Vendor ADD PAN NVARCHAR(50) NULL;
IF COL_LENGTH('app.Vendor', 'LUTARN') IS NULL ALTER TABLE app.Vendor ADD LUTARN NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'BankName') IS NULL ALTER TABLE app.Vendor ADD BankName NVARCHAR(255) NULL;
IF COL_LENGTH('app.Vendor', 'BankBranch') IS NULL ALTER TABLE app.Vendor ADD BankBranch NVARCHAR(255) NULL;
IF COL_LENGTH('app.Vendor', 'AccountNumber') IS NULL ALTER TABLE app.Vendor ADD AccountNumber NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'IFSC') IS NULL ALTER TABLE app.Vendor ADD IFSC NVARCHAR(50) NULL;
IF COL_LENGTH('app.Vendor', 'SWIFT') IS NULL ALTER TABLE app.Vendor ADD SWIFT NVARCHAR(50) NULL;
IF COL_LENGTH('app.Vendor', 'CountryOfOrigin') IS NULL ALTER TABLE app.Vendor ADD CountryOfOrigin NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'PreCarriageBy') IS NULL ALTER TABLE app.Vendor ADD PreCarriageBy NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'PlaceOfReceipt') IS NULL ALTER TABLE app.Vendor ADD PlaceOfReceipt NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'PortOfLoading') IS NULL ALTER TABLE app.Vendor ADD PortOfLoading NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'Packing') IS NULL ALTER TABLE app.Vendor ADD Packing NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'Grade') IS NULL ALTER TABLE app.Vendor ADD Grade NVARCHAR(100) NULL;
IF COL_LENGTH('app.Vendor', 'DeclarationText') IS NULL ALTER TABLE app.Vendor ADD DeclarationText NVARCHAR(MAX) NULL;
IF COL_LENGTH('app.Vendor', 'AuthorisedSignatoryLabel') IS NULL ALTER TABLE app.Vendor ADD AuthorisedSignatoryLabel NVARCHAR(255) NULL;
GO
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  DECLARE @CompanyVendorId INT;
  DECLARE @AddressLine1 NVARCHAR(255) = N'S.NO: 1174/2B, ONGOLE ROAD';
  DECLARE @AddressLine2 NVARCHAR(255) = N'MARKAPUR - 523 316';
  DECLARE @AddressLine3 NVARCHAR(255) = N'PRAKASAM D.T. (A.P) INDIA.';

  SELECT TOP (1) @CompanyVendorId = VendorId
  FROM app.Vendor WITH (UPDLOCK, HOLDLOCK)
  WHERE VendorCode = 'SHRIYA-MINING' OR VendorName = 'SHRIYA MINING INDUSTRIES'
  ORDER BY CASE WHEN VendorCode = 'SHRIYA-MINING' THEN 0 ELSE 1 END, VendorId;

  IF @CompanyVendorId IS NULL
  BEGIN
    INSERT INTO app.Vendor (
      VendorCode, VendorName, LegalName, AddressLine1, AddressLine2, AddressLine3,
      Country, Address, Phone, Email, CountryOfOrigin, PreCarriageBy, PlaceOfReceipt,
      PortOfLoading, Packing, Grade, DeclarationText, AuthorisedSignatoryLabel,
      CreatedBy, ModifiedBy
    )
    VALUES (
      'SHRIYA-MINING', 'SHRIYA MINING INDUSTRIES', 'SHRIYA MINING INDUSTRIES',
      @AddressLine1, @AddressLine2, @AddressLine3, 'INDIA',
      CONCAT(@AddressLine1, CHAR(10), @AddressLine2, CHAR(10), @AddressLine3),
      NULL, NULL, 'INDIA', 'BY ROAD', 'CHENNAI', 'CHENNAI', 'WOODEN CRATES',
      'FIRST GRADE',
      'We declare that this Invoice shows the actual price of the goods described and that all particulars are true and correct.',
      'Authorised Signatory', 'system', 'system'
    );
    SET @CompanyVendorId = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE app.Vendor
    SET VendorCode = 'SHRIYA-MINING',
        VendorName = 'SHRIYA MINING INDUSTRIES',
        LegalName = 'SHRIYA MINING INDUSTRIES',
        AddressLine1 = @AddressLine1,
        AddressLine2 = @AddressLine2,
        AddressLine3 = @AddressLine3,
        Country = 'INDIA',
        Address = CONCAT(@AddressLine1, CHAR(10), @AddressLine2, CHAR(10), @AddressLine3),
        CountryOfOrigin = 'INDIA',
        PreCarriageBy = 'BY ROAD',
        PlaceOfReceipt = 'CHENNAI',
        PortOfLoading = 'CHENNAI',
        Packing = 'WOODEN CRATES',
        Grade = 'FIRST GRADE',
        DeclarationText = 'We declare that this Invoice shows the actual price of the goods described and that all particulars are true and correct.',
        AuthorisedSignatoryLabel = 'Authorised Signatory',
        ModifiedOn = SYSUTCDATETIME(),
        ModifiedBy = 'system'
    WHERE VendorId = @CompanyVendorId;
  END;

  UPDATE app.Invoice SET VendorId = @CompanyVendorId WHERE VendorId <> @CompanyVendorId;
  UPDATE sales.POImportBatch SET VendorId = @CompanyVendorId WHERE VendorId <> @CompanyVendorId;
  UPDATE app.Vendor
  SET IsDeleted = 1, ModifiedOn = SYSUTCDATETIME(), ModifiedBy = 'system'
  WHERE VendorId <> @CompanyVendorId AND IsDeleted = 0;
  UPDATE app.Vendor
  SET IsDeleted = 0, ModifiedOn = SYSUTCDATETIME(), ModifiedBy = 'system'
  WHERE VendorId = @CompanyVendorId AND IsDeleted = 1;

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.Vendor') AND name = 'UX_Vendor_OnlyOneActive')
    CREATE UNIQUE INDEX UX_Vendor_OnlyOneActive ON app.Vendor (IsDeleted) WHERE IsDeleted = 0;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
