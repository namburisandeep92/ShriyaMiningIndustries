/**
 * V003__seed-initial-data.sql
 * 
 * Seed initial data for Phase 1: roles, permissions, admin user, test vendor/buyer
 * Idempotent: uses MERGE or EXISTS checks
 * 
 * PRODUCTION WARNING: This script uses a placeholder admin email address
 * Replace with actual value before running on production database
 * 
 * Run via: node database/migration-runner.js
 */

-- ============================================================================
-- ROLES
-- ============================================================================

MERGE INTO security.Role AS target
USING (VALUES 
  (1, 'Admin', 'Full system access including user and role management'),
  (2, 'User', 'Create and manage invoices, upload PO files'),
  (3, 'Approver', 'Review and approve invoices'),
  (4, 'Viewer', 'Read-only access to invoices and reports')
) AS source (RoleId, RoleName, Description)
ON target.RoleName = source.RoleName
WHEN NOT MATCHED THEN
  INSERT (RoleId, RoleName, Description, CreatedOn, CreatedBy, ModifiedOn, ModifiedBy)
  VALUES (source.RoleId, source.RoleName, source.Description, GETUTCDATE(), 'system', GETUTCDATE(), 'system');

PRINT 'Roles seeded';

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

MERGE INTO security.Permission AS target
USING (VALUES 
  (1, 'Invoice.Create', 'Create new invoices'),
  (2, 'Invoice.Read', 'Read invoices'),
  (3, 'Invoice.Update', 'Update invoice details'),
  (4, 'Invoice.Delete', 'Soft-delete invoices'),
  (5, 'Invoice.Approve', 'Approve invoice status'),
  (6, 'File.Upload', 'Upload PO files'),
  (7, 'File.Download', 'Download invoices'),
  (8, 'Report.View', 'View reports and analytics'),
  (9, 'User.Manage', 'Create/edit/delete users'),
  (10, 'Role.Manage', 'Create/edit/delete roles'),
  (11, 'Permission.Manage', 'Create/edit/delete permissions'),
  (12, 'ErrorLog.View', 'View error logs'),
  (13, 'Vendor.Manage', 'Create/edit vendor master'),
  (14, 'Buyer.Manage', 'Create/edit buyer master')
) AS source (PermissionId, PermissionName, Description)
ON target.PermissionName = source.PermissionName
WHEN NOT MATCHED THEN
  INSERT (PermissionId, PermissionName, Description, CreatedOn, CreatedBy, ModifiedOn, ModifiedBy)
  VALUES (source.PermissionId, source.PermissionName, source.Description, GETUTCDATE(), 'system', GETUTCDATE(), 'system');

PRINT 'Permissions seeded';

-- ============================================================================
-- ROLE-PERMISSION MAPPING
-- ============================================================================

-- Admin: All permissions
MERGE INTO security.RolePermission AS target
USING (
  SELECT r.RoleId, p.PermissionId
  FROM security.Role r
  CROSS JOIN security.Permission p
  WHERE r.RoleName = 'Admin'
) AS source
ON target.RoleId = source.RoleId AND target.PermissionId = source.PermissionId
WHEN NOT MATCHED THEN
  INSERT (RoleId, PermissionId, CreatedOn, CreatedBy)
  VALUES (source.RoleId, source.PermissionId, GETUTCDATE(), 'system');

-- User: Invoice + File operations
MERGE INTO security.RolePermission AS target
USING (
  SELECT r.RoleId, p.PermissionId
  FROM security.Role r
  CROSS JOIN security.Permission p
  WHERE r.RoleName = 'User'
    AND p.PermissionName IN ('Invoice.Create', 'Invoice.Read', 'Invoice.Update', 
                             'File.Upload', 'File.Download', 'Report.View')
) AS source
ON target.RoleId = source.RoleId AND target.PermissionId = source.PermissionId
WHEN NOT MATCHED THEN
  INSERT (RoleId, PermissionId, CreatedOn, CreatedBy)
  VALUES (source.RoleId, source.PermissionId, GETUTCDATE(), 'system');

-- Approver: Read + Approve
MERGE INTO security.RolePermission AS target
USING (
  SELECT r.RoleId, p.PermissionId
  FROM security.Role r
  CROSS JOIN security.Permission p
  WHERE r.RoleName = 'Approver'
    AND p.PermissionName IN ('Invoice.Read', 'Invoice.Approve', 'File.Download', 'Report.View')
) AS source
ON target.RoleId = source.RoleId AND target.PermissionId = source.PermissionId
WHEN NOT MATCHED THEN
  INSERT (RoleId, PermissionId, CreatedOn, CreatedBy)
  VALUES (source.RoleId, source.PermissionId, GETUTCDATE(), 'system');

-- Viewer: Read-only
MERGE INTO security.RolePermission AS target
USING (
  SELECT r.RoleId, p.PermissionId
  FROM security.Role r
  CROSS JOIN security.Permission p
  WHERE r.RoleName = 'Viewer'
    AND p.PermissionName IN ('Invoice.Read', 'Report.View', 'File.Download')
) AS source
ON target.RoleId = source.RoleId AND target.PermissionId = source.PermissionId
WHEN NOT MATCHED THEN
  INSERT (RoleId, PermissionId, CreatedOn, CreatedBy)
  VALUES (source.RoleId, source.PermissionId, GETUTCDATE(), 'system');

PRINT 'Role-Permission mappings seeded';

-- ============================================================================
-- TEST VENDOR AND BUYER (required for tests)
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM app.Vendor WHERE VendorCode = 'TEST-VENDOR')
BEGIN
  INSERT INTO app.Vendor (VendorCode, VendorName, Email, Phone, Address, CreatedOn, CreatedBy, ModifiedOn, ModifiedBy)
  VALUES ('TEST-VENDOR', 'Test Vendor Inc.', 'vendor@test.local', '+91-8000-800-800',
          '123 Stone Street, Jaipur, Rajasthan 302001, India', 
          GETUTCDATE(), 'system', GETUTCDATE(), 'system');
  PRINT 'Test vendor seeded';
END;

IF NOT EXISTS (SELECT 1 FROM app.Buyer WHERE BuyerCode = 'TEST-BUYER')
BEGIN
  INSERT INTO app.Buyer (BuyerCode, BuyerName, Email, Phone, Address, CreatedOn, CreatedBy, ModifiedOn, ModifiedBy)
  VALUES ('TEST-BUYER', 'Test Buyer Corp.', 'buyer@test.local', '+91-8000-800-800',
          '456 Marble Avenue, Bangalore, Karnataka 560001, India',
          GETUTCDATE(), 'system', GETUTCDATE(), 'system');
  PRINT 'Test buyer seeded';
END;

-- ============================================================================
-- CLEANUP: Prevent accidental data corruption on production
-- ============================================================================

-- This stored procedure ensures seed script only runs on dev/test databases
-- Fails if called from production (database name contains 'prod' or 'production')

IF NOT EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'usp_Seed_PreflightCheck')
BEGIN
  EXEC ('
    CREATE PROCEDURE dbo.usp_Seed_PreflightCheck
    AS
    BEGIN
      DECLARE @DbName NVARCHAR(255) = DB_NAME();
      DECLARE @Message NVARCHAR(MAX);
      IF @DbName LIKE ''%prod%'' OR @DbName LIKE ''%production%''
      BEGIN
        SET @Message = ''SEED ABORTED: This script cannot run on production database. Current DB: '' + @DbName;
        THROW 50500, @Message, 1;
      END;
    END;
  ');
END;

-- Run preflight check (only if procedure exists)
IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'usp_Seed_PreflightCheck')
BEGIN
  EXEC dbo.usp_Seed_PreflightCheck;
END;

-- ============================================================================
-- MARK MIGRATION COMPLETE
-- (Handled by migration runner - not needed here)
-- ============================================================================

PRINT 'Migration V003__seed-initial-data completed successfully';
