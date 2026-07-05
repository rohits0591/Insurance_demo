const { v4: uuidv4 } = require('uuid');
const { db } = require('../../lib/firebaseAdmin');
const { requireApiKey, sendJson } = require('../../lib/http');
const { sendSms } = require('../../lib/sms');

// POST /api/payment/create-link
// Body: { "policyNumber": "SLI-100234", "sendSms": true }
//
// Called by the WxCC AI Agent flow after confirming the customer wants to
// pay their premium now. Creates a pending payment record and returns a
// dummy payment link the agent can read out / SMS to the customer.
module.exports = async (req, res) => {
  if (!requireApiKey(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { policyNumber, sendSmsToCustomer } = req.body || {};

  if (!policyNumber) {
    return sendJson(res, 400, { error: 'policyNumber is required' });
  }

  try {
    const firestore = db();
    const policyDoc = await firestore.collection('policyholders').doc(policyNumber).get();

    if (!policyDoc.exists) {
      return sendJson(res, 404, { error: `Policy ${policyNumber} not found` });
    }

    const policy = policyDoc.data();
    const paymentId = uuidv4();
    const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
    const paymentLink = `${baseUrl}/pay.html?paymentId=${paymentId}`;

    const paymentRecord = {
      paymentId,
      policyNumber,
      customerName: policy.name,
      phone: policy.phone,
      policyType: policy.policyType,
      amount: policy.premiumAmount,
      status: 'pending',
      paymentLink,
      createdAt: new Date().toISOString(),
      paidAt: null,
      receiptId: null,
    };

    await firestore.collection('payments').doc(paymentId).set(paymentRecord);

    if (sendSmsToCustomer) {
      await sendSms(
        policy.phone,
        `Dear ${policy.name}, pay your premium of INR ${policy.premiumAmount} for policy ${policyNumber} here: ${paymentLink}`
      );
    }

    return sendJson(res, 200, {
      paymentId,
      paymentLink,
      amount: policy.premiumAmount,
      policyNumber,
      customerName: policy.name,
    });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
