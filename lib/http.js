// Shared helpers for API key auth, CORS, and JSON responses across all
// serverless functions in /api.

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

// Returns true if request is authorized, otherwise sends a 401 and returns false.
function requireApiKey(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }

  const expected = process.env.API_KEY;
  const provided = req.headers['x-api-key'];

  if (!expected) {
    // No API_KEY configured -> demo mode, allow through (not recommended for prod)
    return true;
  }

  if (provided !== expected) {
    res.status(401).json({ error: 'Unauthorized. Missing or invalid x-api-key header.' });
    return false;
  }

  return true;
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = { withCors, requireApiKey, sendJson };
