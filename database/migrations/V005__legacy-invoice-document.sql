IF COL_LENGTH('app.Invoice','DocumentJson') IS NULL
BEGIN
  ALTER TABLE app.Invoice ADD DocumentJson NVARCHAR(MAX) NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_Invoice_DocumentJson' AND parent_object_id=OBJECT_ID('app.Invoice'))
  ALTER TABLE app.Invoice ADD CONSTRAINT CK_Invoice_DocumentJson
    CHECK (DocumentJson IS NULL OR ISJSON(DocumentJson)=1);
ALTER TABLE app.Invoice ALTER COLUMN PONumber NVARCHAR(MAX) NULL;
ALTER TABLE app.InvoiceLine ALTER COLUMN UnitPrice DECIMAL(19,6) NOT NULL;
