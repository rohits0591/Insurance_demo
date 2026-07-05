const { db } = require('../../lib/firebaseAdmin');
const { requireApiKey, sendJson } = require('../../lib/http');
const { recommendAddOn } = require('../../lib/rules');

// GET /api/policy/:policyNumber
// Called by the WxCC AI Agent flow to fetch policy + premium/renewal
// details before speaking to the customer.
module.exports = async (req, res) => {
  if (!requireApiKey(req, res)) return;
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { policyNumber } = req.query;

  try {
    const doc = await db().collection('policyholders').doc(policyNumber).get();

    if (!doc.exists) {
      return sendJson(res, 404, { error: `Policy ${policyNumber} not found` });
    }

    const data = doc.data();

    return sendJson(res, 200, {
      policyNumber: data.policyNumber,
      name: data.name,
      phone: data.phone,
      email: data.email,
      policyType: data.policyType,
      sumAssured: data.sumAssured,
      premiumAmount: data.premiumAmount,
      premiumDueDate: data.premiumDueDate,
      renewalDate: data.renewalDate,
      status: data.status,
      recommendedAddOn: recommendAddOn(data.ageBand),
    });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
