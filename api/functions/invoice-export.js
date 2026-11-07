/**
 * Invoice Export Handler
 * GET /api/invoices/:id/export - Download invoice as Excel or PDF
 */

import { asyncHandler, Errors } from '../middleware/error-handler.js';
import { getDatabase } from '../services/database.js';
import ExcelJS from 'exceljs';
import { invoiceId as validateInvoiceId, positiveInteger } from '../services/api-contracts.js';

/**
 * GET /api/invoices/:id/export
 * Export invoice as Excel or PDF (format query param)
 * ?format=excel (default) or ?format=pdf
 * ?version=N (optional, export specific version)
 */
const handleExportInvoice = asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const { id: invoiceId } = req.params;
  const { format = 'excel', version } = req.query;

  // Check permission
  if (!req.user?.permissions?.includes('invoice.read')) {
    throw Errors.Forbidden('export invoice');
  }

  validateInvoiceId(invoiceId);

  if (typeof format !== 'string' || !['excel', 'pdf'].includes(format.toLowerCase())) {
    throw Errors.InvalidInput('format must be "excel" or "pdf"');
  }

  const db = getDatabase();

  // Get invoice data
  let result;
  if (version) {
    result = await db.execute('app.usp_Invoice_GetVersion', {
      correlationId,
      invoiceId,
      version: positiveInteger(version, 'version'),
    });
  } else {
    result = await db.execute('app.usp_Invoice_GetById', {
      correlationId,
      invoiceId,
    });
  }

  if (!result.recordset || result.recordset.length === 0) {
    throw Errors.NotFound('Invoice');
  }

  const invoice = result.recordset[0];
  const items = result.recordsets[1] || [];

  if (format.toLowerCase() === 'excel') {
    return await generateExcelExport(res, invoice, items);
  } else {
    return await generatePDFExport(res, invoice, items);
  }
});

/**
 * Generate Excel export
 */
async function generateExcelExport(res, invoice, items) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Invoice');

  // Set column widths
  worksheet.columns = [
    { header: 'Line', key: 'line', width: 8 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Unit Rate', key: 'rate', width: 12 },
    { header: 'Line Amount', key: 'lineAmount', width: 15 },
    { header: 'Tax Rate', key: 'taxRate', width: 10 },
    { header: 'Tax', key: 'tax', width: 12 },
  ];

  // Add header rows
  worksheet.mergeCells('A1:G1');
  worksheet.getCell('A1').value = `Invoice: ${invoice.InvoiceNumber}`;
  worksheet.getCell('A1').font = { bold: true, size: 14 };

  worksheet.mergeCells('A2:G2');
  worksheet.getCell('A2').value = `Created: ${invoice.CreatedOn}`;

  // Add table header
  worksheet.addRow(['Line', 'Description', 'Quantity', 'Unit Rate', 'Line Amount', 'Tax Rate', 'Tax']);

  // Add data rows
  let lineNum = 1;
  let subtotal = 0;
  let totalTax = 0;

  items.forEach(item => {
    worksheet.addRow({
      line: lineNum++,
      description: item.Description,
      quantity: item.Quantity,
      rate: item.Rate,
      lineAmount: item.LineAmount,
      taxRate: item.TaxRate,
      tax: item.Tax,
    });

    subtotal += item.LineAmount || 0;
    totalTax += item.Tax || 0;
  });

  // Add totals
  const totalRow = worksheet.addRow();
  worksheet.mergeCells(`A${totalRow.number}:E${totalRow.number}`);
  worksheet.getCell(`A${totalRow.number}`).value = 'SUBTOTAL:';
  worksheet.getCell(`F${totalRow.number}`).value = subtotal;

  const taxRow = worksheet.addRow();
  worksheet.mergeCells(`A${taxRow.number}:E${taxRow.number}`);
  worksheet.getCell(`A${taxRow.number}`).value = 'TAX:';
  worksheet.getCell(`F${taxRow.number}`).value = totalTax;

  const grandTotalRow = worksheet.addRow();
  worksheet.mergeCells(`A${grandTotalRow.number}:E${grandTotalRow.number}`);
  worksheet.getCell(`A${grandTotalRow.number}`).value = 'TOTAL:';
  worksheet.getCell(`A${grandTotalRow.number}`).font = { bold: true };
  worksheet.getCell(`F${grandTotalRow.number}`).value = subtotal + totalTax;
  worksheet.getCell(`F${grandTotalRow.number}`).font = { bold: true };

  // Write to buffer
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  // Send response
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${invoice.InvoiceNumber}.xlsx"`
  );
  res.setHeader('Content-Length', buffer.length);

  res.send(buffer);
}

/**
 * Generate PDF export (placeholder - would use PDFKit or similar)
 */
async function generatePDFExport(res, invoice, items) {
  const { default: PDFDocument } = await import('pdfkit');
  const document = new PDFDocument({ margin: 40 });
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.fontSize(18).text(`Invoice: ${invoice.InvoiceNumber}`);
  document.fontSize(10).text(`Date: ${new Date(invoice.InvoiceDate).toISOString().slice(0, 10)}`);
  document.text(`Vendor: ${invoice.VendorName}`);
  document.text(`Buyer: ${invoice.BuyerName}`);
  document.moveDown();
  items.forEach((item, index) => {
    document.text(`${index + 1}. ${item.Description}`);
    document.text(`Quantity: ${item.Quantity}  Rate: ${item.Rate}  Amount: ${item.LineAmount}  Tax: ${item.Tax}`);
    document.moveDown();
  });
  document.text(`Subtotal: ${invoice.TotalAmount}  Tax: ${invoice.TaxAmount}  Total: ${invoice.FinalAmount}`);
  document.end();
  const pdfContent = await finished;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${invoice.InvoiceNumber}.pdf"`
  );

  res.send(pdfContent);
}

export {
  handleExportInvoice,
};
