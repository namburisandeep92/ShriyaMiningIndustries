/**
 * PO Import Handler
 * POST /api/po-import - Upload and parse Excel PO file
 * GET /api/po-import - List imports with paging
 */

const { asyncHandler, Errors } = require('../middleware/error-handler');
const { getDatabase } = require('../services/database');
const ExcelJS = require('exceljs');
const invoiceUtils = require('../../tests/utils/invoice-utils');

// Required columns for PO import
const REQUIRED_COLUMNS = [
  'Line Number',
  'Product Code',
  'Description',
  'Quantity',
  'Unit Rate',
  'Tax Rate',
];

/**
 * POST /api/po-import
 * Upload Excel PO file, validate, and store in database
 */
const handleUploadPO = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { vendorId, poNumber } = req.body;
  const file = req.files?.po || req.body.file;

  // Validate input
  if (!file) {
    throw Errors.InvalidInput('file (Excel PO) is required');
  }
  if (!vendorId) {
    throw Errors.InvalidInput('vendorId is required');
  }
  if (!poNumber) {
    throw Errors.InvalidInput('poNumber is required');
  }

  // Check permission
  if (!req.user?.permissions?.includes('po.import')) {
    throw Errors.Forbidden('upload PO');
  }

  try {
    // Parse Excel file
    const workbook = new ExcelJS.Workbook();
    const fileBuffer = typeof file === 'string'
      ? Buffer.from(file, 'base64')
      : Buffer.isBuffer(file)
        ? file
        : Buffer.from(JSON.stringify(file));

    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw Errors.InvalidExcelFormat('No worksheet found in Excel file');
    }

    // Extract headers
    const headerRow = worksheet.getRow(1);
    const columns = headerRow.values;

    // Validate columns
    const missingColumns = invoiceUtils.validateColumns(
      columns,
      REQUIRED_COLUMNS
    );
    if (missingColumns && missingColumns.length > 0) {
      throw Errors.InvalidColumns(missingColumns);
    }

    // Parse data rows
    const items = [];
    const columnIndexMap = {};

    // Build column index map
    REQUIRED_COLUMNS.forEach((col, idx) => {
      const colIndex = columns.indexOf(col) + 1; // Excel columns are 1-indexed
      if (colIndex > 0) {
        columnIndexMap[col] = colIndex;
      }
    });

    // Extract rows
    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);

      if (!row.values || row.values[columnIndexMap['Line Number']] === null) {
        continue; // Skip empty rows
      }

      try {
        const lineNum = row.values[columnIndexMap['Line Number']];
        const productCode = row.values[columnIndexMap['Product Code']]?.toString() || '';
        const description = row.values[columnIndexMap['Description']]?.toString() || '';
        const quantity = parseFloat(row.values[columnIndexMap['Quantity']] || 0);
        const rate = parseFloat(row.values[columnIndexMap['Unit Rate']] || 0);
        const taxRate = parseFloat(row.values[columnIndexMap['Tax Rate']] || 0);

        // Parse product description to extract dimensions if present
        const product = invoiceUtils.parseProductDescription(description);

        // Calculate line amount
        const amount = invoiceUtils.calculateLineAmount(quantity, rate);
        const tax = invoiceUtils.calculateTax(amount, taxRate);

        items.push({
          lineNum,
          productCode,
          description,
          quantity,
          rate,
          amount,
          taxRate,
          tax,
          crates: product.crates || 0,
        });
      } catch (err) {
        console.error(`[PO Import] Error parsing row ${rowNum}:`, err.message);
        // Continue processing other rows
      }
    }

    if (items.length === 0) {
      throw Errors.InvalidInput('No valid rows found in Excel file');
    }

    // Insert into database via stored procedure
    const db = getDatabase();
    const result = await db.execute('usp_POImport_Create', {
      correlationId,
      vendorId,
      poNumber,
      importedByEmail: req.user.email,
      rowsJson: JSON.stringify(items),
    });

    if (!result.recordset || result.recordset.length === 0) {
      throw Errors.DatabaseError('Failed to create PO import');
    }

    const importData = result.recordset[0];

    res.status(201).json({
      importId: importData.ImportId,
      vendorId,
      poNumber,
      status: 'pending',
      rowsImported: items.length,
      preview: items.slice(0, 5),
      timestamp: new Date().toISOString(),
      createdBy: req.user.email,
    });
  } catch (err) {
    if (err.code === 'ERR_INVALID_INPUT' || err.statusCode) {
      throw err;
    }
    throw Errors.InvalidExcelFormat(err.message);
  }
});

/**
 * GET /api/po-import
 * List PO imports with paging and filtering
 */
const handleListPOImports = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { vendorId, page = 1, pageSize = 50, status } = req.query;

  // Check permission
  if (!req.user?.permissions?.includes('po.import')) {
    throw Errors.Forbidden('list PO imports');
  }

  // Validate paging
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSz = Math.min(100, Math.max(1, parseInt(pageSize) || 50));

  const db = getDatabase();
  const result = await db.execute('usp_POImport_GetList', {
    correlationId,
    vendorId: vendorId || null,
    status: status || null,
    pageNum,
    pageSize: pageSz,
  });

  if (!result.recordset) {
    throw Errors.DatabaseError('Failed to retrieve PO imports');
  }

  // Extract data and count
  const imports = result.recordset.filter(r => r.ImportId); // Filter metadata
  const totalCount = result.recordset.find(r => r.TotalCount)?.TotalCount || 0;

  res.json({
    imports: imports.map(imp => ({
      importId: imp.ImportId,
      vendorId: imp.VendorId,
      poNumber: imp.PONumber,
      status: imp.Status,
      rowsImported: imp.RowsImported,
      createdBy: imp.CreatedBy,
      createdOn: imp.CreatedOn,
    })),
    pagination: {
      page: pageNum,
      pageSize: pageSz,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSz),
    },
  });
});

module.exports = {
  handleUploadPO,
  handleListPOImports,
};
