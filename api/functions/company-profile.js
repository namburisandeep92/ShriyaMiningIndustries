import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import { companyProfileInput, companyProfileResponse } from '../services/api-contracts.js';

const profileColumns = `LegalName, AddressLine1, AddressLine2, AddressLine3, City, District, State,
  PINCode, Country, Phone, Email, Website, GSTIN, IEC, PAN, LUTARN, BankName, BankBranch,
  AccountNumber, IFSC, SWIFT, CountryOfOrigin, PreCarriageBy, PlaceOfReceipt, PortOfLoading,
  Packing, Grade, DeclarationText, AuthorisedSignatoryLabel`;
const profileOutputColumns = profileColumns.split(',').map(column => `inserted.${column.trim()}`).join(', ');

const handleGetCompanyProfile = asyncHandler(async (req, res) => {
  const [profile] = await getDatabase().query(
    `SELECT TOP (1) ${profileColumns} FROM app.Vendor WHERE IsDeleted = 0 ORDER BY VendorId`,
  );
  if (!profile) throw Errors.DatabaseError('The company profile is not configured');
  res.json(companyProfileResponse(profile));
});

const handleUpdateCompanyProfile = asyncHandler(async (req, res) => {
  if (!req.user?.permissions?.includes('vendor.manage')) throw Errors.Forbidden('manage company profile');
  const profile = companyProfileInput(req.body);
  const [updated] = await getDatabase().query(`
    UPDATE app.Vendor
    SET VendorName = @legalName, LegalName = @legalName,
        AddressLine1 = @addressLine1, AddressLine2 = @addressLine2, AddressLine3 = @addressLine3,
        City = @city, District = @district, State = @state, PINCode = @pinCode, Country = @country,
        Phone = @phone, Email = @email, Website = @website, GSTIN = @gstin, IEC = @iec, PAN = @pan,
        LUTARN = @lutArn, BankName = @bankName, BankBranch = @bankBranch,
        AccountNumber = @accountNumber, IFSC = @ifsc, SWIFT = @swift,
        CountryOfOrigin = @countryOfOrigin, PreCarriageBy = @preCarriageBy,
        PlaceOfReceipt = @placeOfReceipt, PortOfLoading = @portOfLoading,
        Packing = @packing, Grade = @grade, DeclarationText = @declarationText,
        AuthorisedSignatoryLabel = @authorisedSignatoryLabel,
        Address = CONCAT(@addressLine1,
          CASE WHEN @addressLine2 IS NULL THEN '' ELSE CHAR(10) + @addressLine2 END,
          CASE WHEN @addressLine3 IS NULL THEN '' ELSE CHAR(10) + @addressLine3 END),
        ModifiedOn = SYSUTCDATETIME(), ModifiedBy = @modifiedBy
    OUTPUT ${profileOutputColumns}
    WHERE IsDeleted = 0`,
    { ...profile, modifiedBy: req.user.email },
  );
  if (!updated) throw Errors.DatabaseError('The company profile could not be updated');
  res.json(companyProfileResponse(updated));
});

export { handleGetCompanyProfile, handleUpdateCompanyProfile };
