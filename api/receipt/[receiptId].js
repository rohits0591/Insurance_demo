const { db } = require('../../lib/firebaseAdmin');
const { withCors, sendJson } = require('../../lib/http');

// GET /api/receipt/:receiptId
// Public download link (this is what gets SMS'd to the customer's mobile).
// The PDF is stored as base64 directly in the Firestore document (see
// api/payment/complete.js) — no Firebase Storage / Blaze plan required.
module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { receiptId } = req.query;

  try {
    const doc = await db().collection('receipts').doc(receiptId).get();
    if (!doc.exists) {
      return sendJson(res, 404, { error: 'Receipt not found' });
    }

    const receipt = doc.data();
    if (!receipt.pdfBase64) {
      return sendJson(res, 404, { error: 'Receipt PDF data missing' });
    }

    const buffer = Buffer.from(receipt.pdfBase64, 'base64');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${receiptId}.pdf"`);
    return res.status(200).send(buffer);
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
