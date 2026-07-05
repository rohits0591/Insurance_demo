const { sendJson, withCors } = require('../../lib/http');

// GET /api/debug/env-check
// Safe, read-only diagnostic — reports whether critical env vars are present
// and well-formed AT RUNTIME (this is the only reliable way to check
// "Sensitive" env vars, since `vercel env pull` cannot read those back).
// Never prints the actual secret values.
module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const report = {};

  // --- API_KEY ---
  report.API_KEY = {
    present: !!process.env.API_KEY,
    length: (process.env.API_KEY || '').length,
  };

  // --- BASE_URL ---
  report.BASE_URL = {
    present: !!process.env.BASE_URL,
    value: process.env.BASE_URL || null, // not secret, safe to show
  };

  // --- WEBEX_WEBHOOK_URL ---
  report.WEBEX_WEBHOOK_URL = {
    present: !!process.env.WEBEX_WEBHOOK_URL,
    value: process.env.WEBEX_WEBHOOK_URL || null, // not secret, safe to show
  };

  // --- FIREBASE_SERVICE_ACCOUNT_BASE64 ---
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const fb = { present: !!b64, length: (b64 || '').length };

  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      try {
        const json = JSON.parse(decoded);
        fb.decodedOk = true;
        fb.project_id = json.project_id || null;
        fb.client_email = json.client_email || null;
        fb.has_private_key = !!json.private_key;
      } catch (parseErr) {
        fb.decodedOk = false;
        fb.parseError = parseErr.message;
        fb.decodedPreview = decoded.slice(0, 80);
      }
    } catch (decodeErr) {
      fb.decodeError = decodeErr.message;
    }
  }
  report.FIREBASE_SERVICE_ACCOUNT_BASE64 = fb;

  return sendJson(res, 200, report);
};
