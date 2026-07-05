const { db } = require('../../lib/firebaseAdmin');
const { sendJson } = require('../../lib/http');
const { recommendAddOn, isWithinNextNDays } = require('../../lib/rules');

const RENEWAL_WINDOW_DAYS = 7;
const RETRIGGER_COOLDOWN_HOURS = 24;

async function postToWebex(payload) {
  const url = process.env.WEBEX_WEBHOOK_URL;
  if (!url) {
    return { skipped: true, reason: 'WEBEX_WEBHOOK_URL not configured' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.API_KEY) headers['x-api-key'] = process.env.API_KEY;
  if (process.env.WEBEX_WEBHOOK_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.WEBEX_WEBHOOK_AUTH_TOKEN}`;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  return { skipped: false, status: resp.status, ok: resp.ok };
}

// GET/POST /api/cron/check-renewals
// Runs on a daily Vercel Cron schedule (see vercel.json). Scans all active
// policyholders, finds anyone whose renewalDate falls within the next
// 7 days, and (if not already triggered in the last 24h) POSTs a webhook
// to Webex so the WxCC outbound campaign / AI Agent flow can pick them up.
//
// This endpoint is also safe to call manually/on-demand during a live demo
// to trigger the webhook immediately instead of waiting for the schedule.
module.exports = async (req, res) => {
  try {
    const firestore = db();
    const snapshot = await firestore
      .collection('policyholders')
      .where('status', '==', 'active')
      .get();

    const dueForRenewal = [];
    const triggered = [];
    const skippedCooldown = [];

    for (const doc of snapshot.docs) {
      const policy = doc.data();

      if (!isWithinNextNDays(policy.renewalDate, RENEWAL_WINDOW_DAYS)) continue;

      dueForRenewal.push(policy.policyNumber);

      const lastTrigger = policy.lastRenewalTriggerAt
        ? new Date(policy.lastRenewalTriggerAt)
        : null;
      const cooldownActive =
        lastTrigger &&
        Date.now() - lastTrigger.getTime() < RETRIGGER_COOLDOWN_HOURS * 60 * 60 * 1000;

      if (cooldownActive) {
        skippedCooldown.push(policy.policyNumber);
        continue;
      }

      const payload = {
        eventType: 'POLICY_RENEWAL_DUE',
        policyNumber: policy.policyNumber,
        customerName: policy.name,
        phone: policy.phone,
        email: policy.email,
        policyType: policy.policyType,
        renewalDate: policy.renewalDate,
        premiumAmount: policy.premiumAmount,
        sumAssured: policy.sumAssured,
        recommendedAddOn: recommendAddOn(policy.ageBand),
        triggeredAt: new Date().toISOString(),
      };

      const webhookResult = await postToWebex(payload);

      await firestore.collection('renewal_triggers').add({
        ...payload,
        webhookResult,
      });

      await doc.ref.update({ lastRenewalTriggerAt: payload.triggeredAt });

      triggered.push({ policyNumber: policy.policyNumber, webhookResult });
    }

    return sendJson(res, 200, {
      message: `Renewal check complete. ${dueForRenewal.length} within ${RENEWAL_WINDOW_DAYS} days, ${triggered.length} webhook(s) fired, ${skippedCooldown.length} skipped (cooldown).`,
      dueForRenewal,
      triggered,
      skippedCooldown,
    });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
