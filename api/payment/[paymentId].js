const { db } = require('../../lib/firebaseAdmin');
const { withCors, sendJson } = require('../../lib/http');

// GET /api/payment/:paymentId
// NOTE: intentionally NOT protected by x-api-key — this is the endpoint the
// *customer's browser* calls from the public pay.html page. The unguessable
// UUID paymentId is the access control here, same as any real payment link.
// Fetches current payment status/details. Used by pay.html to render the
// dummy checkout page, and can also be polled by the AI agent on a
// follow-up call to confirm whether payment went through.
module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { paymentId } = req.query;

  try {
    const doc = await db().collection('payments').doc(paymentId).get();
    if (!doc.exists) {
      return sendJson(res, 404, { error: 'Payment not found' });
    }
    return sendJson(res, 200, doc.data());
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
