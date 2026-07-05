const { db } = require('../../lib/firebaseAdmin');
const { withCors, requireApiKey, sendJson } = require('../../lib/http');

// POST /api/webex  — mock Webex-side webhook receiver
//   A stand-in for the real Webex Webhook-triggered Flow / Acqueon inbound
//   API. Point WEBEX_WEBHOOK_URL at this endpoint during early demo/testing
//   so you can see the renewal-check cron firing end-to-end before the real
//   WxCC Flow Designer webhook trigger or Acqueon endpoint is wired up.
//   Logs every payload it receives to Firestore ('mock_webex_events').
//
// GET /api/webex  — view the last 20 logged payloads (x-api-key required)
//   Handy to show on screen during the demo as "proof" the webhook fired.
module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const payload = req.body || {};
      // eslint-disable-next-line no-console
      console.log('[MOCK WEBEX RECEIVER] payload:', JSON.stringify(payload));

      await db().collection('mock_webex_events').add({
        receivedAt: new Date().toISOString(),
        payload,
      });

      return sendJson(res, 200, {
        message:
          'Mock Webex receiver got the payload. In production, wire WEBEX_WEBHOOK_URL to your WxCC Flow / Acqueon endpoint instead.',
        received: payload,
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === 'GET') {
    if (!requireApiKey(req, res)) return;
    try {
      const snapshot = await db()
        .collection('mock_webex_events')
        .orderBy('receivedAt', 'desc')
        .limit(20)
        .get();

      const events = snapshot.docs.map((d) => d.data());
      return sendJson(res, 200, { count: events.length, events });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
