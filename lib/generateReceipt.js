const PDFDocument = require('pdfkit');

/**
 * Generates a premium payment receipt PDF and resolves with a Buffer.
 * @param {Object} data
 * @param {string} data.receiptId
 * @param {string} data.policyNumber
 * @param {string} data.customerName
 * @param {string} data.policyType
 * @param {number} data.amount
 * @param {string} data.paidAt - ISO date string
 * @param {string} data.paymentId
 */
function generateReceiptPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const paidDate = new Date(data.paidAt);

    // Header
    doc
      .fontSize(20)
      .fillColor('#0B5FFF')
      .text('Axis Max Life Insurance', { align: 'left' })
      .fontSize(10)
      .fillColor('#666666')
      .text('Demo Insurer — Webex CX Pre-Sales Showcase', { align: 'left' })
      .moveDown(1.5);

    doc
      .fontSize(16)
      .fillColor('#000000')
      .text('Premium Payment Receipt', { align: 'center', underline: true })
      .moveDown(1.5);

    const rows = [
      ['Receipt No.', data.receiptId],
      ['Payment Reference', data.paymentId],
      ['Policy Number', data.policyNumber],
      ['Policy Holder', data.customerName],
      ['Policy Type', data.policyType || 'N/A'],
      ['Amount Paid', `INR ${Number(data.amount).toLocaleString('en-IN')}`],
      ['Payment Date', paidDate.toLocaleString('en-IN')],
      ['Payment Status', 'SUCCESS'],
    ];

    const startX = 50;
    let y = doc.y;
    const rowHeight = 26;

    rows.forEach(([label, value], idx) => {
      const rowY = y + idx * rowHeight;
      if (idx % 2 === 0) {
        doc.rect(startX, rowY - 4, 495, rowHeight).fill('#F3F6FF');
      }
      doc
        .fillColor('#333333')
        .fontSize(11)
        .text(label, startX + 10, rowY, { width: 180, continued: false })
        .fillColor('#000000')
        .text(String(value), startX + 200, rowY, { width: 290 });
    });

    doc.moveDown(rows.length + 3);

    doc
      .fontSize(9)
      .fillColor('#888888')
      .text(
        'This is a system-generated receipt for demo purposes and does not represent an actual financial transaction.',
        { align: 'center' }
      );

    doc.end();
  });
}

module.exports = { generateReceiptPdf };
