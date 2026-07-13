const { db } = require('../../lib/firebaseAdmin');
const { requireApiKey, sendJson } = require('../../lib/http');
const { recommendAddOn } = require('../../lib/rules');

// GET /api/policy/by-phone?phone=+919810000001
//
// Looks up a policyholder by phone number — this is the endpoint the WxCC
// flow calls at the very start of an outbound (or inbound) call using the
// caller's ANI, so the AI agent can build its dynamic greeting
// ({{customerName}}, {{policyNumber}}, {{premiumAmount}}, etc.) WITHOUT ever
// asking the customer to state their own policy number.
//
// Accepts phone numbers with or without a leading "+" and normalizes both
// sides of the comparison so "+919810000001", "919810000001" and
// "9810000001" all match the same stored record.
//
// If more than one policy is linked to the same phone number, all matches
// are returned in `policies` so the flow can decide how to handle it
// (e.g. ask which policy, or read out the soonest due one).
function normalizePhone(p) {
  if (!p) return '';
  return String(p).replace(/[^\d]/g, '').slice(-10); // compare by last 10 digits
}

module.exports = async (req, res) => {
  if (!requireApiKey(req, res)) return;
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { phone } = req.query;
  if (!phone) {
    return sendJson(res, 400, { error: 'phone query parameter is required, e.g. /api/policy/by-phone?phone=+919810000001' });
  }

  const targetPhone = normalizePhone(phone);

  try {
    const snapshot = await db().collection('policyholders').get();

    const matches = snapshot.docs
      .map((d) => d.data())
      .filter((p) => normalizePhone(p.phone) === targetPhone);

    if (matches.length === 0) {
      return sendJson(res, 404, { error: `No policyholder found for phone ${phone}` });
    }

    const policies = matches.map((data) => ({
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
    }));

    return sendJson(res, 200, {
      count: policies.length,
      // Convenience: first match surfaced at top level for the common
      // single-policy case, so the flow doesn't have to index into an array.
      policyNumber: policies[0].policyNumber,
      name: policies[0].name,
      premiumAmount: policies[0].premiumAmount,
      premiumDueDate: policies[0].premiumDueDate,
      renewalDate: policies[0].renewalDate,
      recommendedAddOn: policies[0].recommendedAddOn,
      policies,
    });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
