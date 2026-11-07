IF COL_LENGTH('app.InvoiceLine', 'TaxRate') IS NULL
  ALTER TABLE app.InvoiceLine ADD TaxRate DECIMAL(9,4) NOT NULL CONSTRAINT DF_InvoiceLine_TaxRate DEFAULT 0;
IF COL_LENGTH('app.InvoiceLine', 'TaxAmount') IS NULL
  ALTER TABLE app.InvoiceLine ADD TaxAmount DECIMAL(19,2) NOT NULL CONSTRAINT DF_InvoiceLine_TaxAmount DEFAULT 0;
IF COL_LENGTH('sales.POImportBatch', 'PONumber') IS NULL
  ALTER TABLE sales.POImportBatch ADD PONumber NVARCHAR(50) NULL;
IF COL_LENGTH('app.Invoice', 'PONumber') IS NULL
  ALTER TABLE app.Invoice ADD PONumber NVARCHAR(50) NULL;
IF OBJECT_ID('app.InvoiceSnapshot', 'U') IS NULL
BEGIN
  CREATE TABLE app.InvoiceSnapshot (
    InvoiceId UNIQUEIDENTIFIER NOT NULL REFERENCES app.Invoice(InvoiceId),
    Version INT NOT NULL,
    HeaderJson NVARCHAR(MAX) NOT NULL CHECK (ISJSON(HeaderJson) = 1),
    LinesJson NVARCHAR(MAX) NOT NULL CHECK (ISJSON(LinesJson) = 1),
    PRIMARY KEY (InvoiceId, Version)
  );
END;
