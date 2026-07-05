const { db } = require('../../lib/firebaseAdmin');
const { requireApiKey, sendJson } = require('../../lib/http');
const { recommendAddOn, isWithinNextNDays } = require('../../lib/rules');

// GET /api/campaign?days=7
//   Pull-based alternative to the webhook: Acqueon Campaign Manager (or
//   anything else) can poll this on a schedule to fetch the current list of
//   policyholders due for renewal, instead of waiting for our webhook push.
//
// GET /api/campaign?log=true
//   Shows the history of renewal webhook triggers fired by the cron job —
//   useful as an audit trail of what fired and when.
//
// Both require header x-api-key.
module.exports = async (req, res) => {
  if (!requireApiKey(req, res)) return;
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const showLog = req.query.log === 'true' || req.query.log === '1';

  try {
    if (showLog) {
      const snapshot = await db()
        .collection('renewal_triggers')
        .orderBy('triggeredAt', 'desc')
        .limit(50)
        .get();

      const logs = snapshot.docs.map((d) => d.data());
      return sendJson(res, 200, { count: logs.length, logs });
    }

    const days = parseInt(req.query.days, 10) || 7;

    const snapshot = await db()
      .collection('policyholders')
      .where('status', '==', 'active')
      .get();

    const list = snapshot.docs
      .map((d) => d.data())
      .filter((p) => isWithinNextNDays(p.renewalDate, days))
      .map((p) => ({
        policyNumber: p.policyNumber,
        name: p.name,
        phone: p.phone,
        email: p.email,
        policyType: p.policyType,
        renewalDate: p.renewalDate,
        premiumAmount: p.premiumAmount,
        recommendedAddOn: recommendAddOn(p.ageBand),
      }));

    return sendJson(res, 200, { windowDays: days, count: list.length, list });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
