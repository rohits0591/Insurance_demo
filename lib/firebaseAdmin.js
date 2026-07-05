const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

function initFirebase() {
  if (admin.apps.length) {
    return admin;
  }

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_BASE64 env var is missing. Set it in Vercel project settings.'
    );
  }

  let decoded;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch (e) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_BASE64 could not be base64-decoded. Re-copy the value from sa_base64.txt — it may have been truncated or corrupted when pasted into Vercel.'
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(decoded);
  } catch (e) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_BASE64 decoded but is not valid JSON (${e.message}). ` +
        'This means the base64 string is incomplete/corrupted. Re-run the base64 encode ' +
        'command and re-paste the FULL single-line output into Vercel env vars, then redeploy.'
    );
  }

  const requiredFields = ['project_id', 'private_key', 'client_email'];
  const missing = requiredFields.filter((f) => !serviceAccount[f]);
  if (missing.length) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_BASE64 decoded to JSON but is missing required field(s): ${missing.join(
        ', '
      )}. This means the pasted value was truncated. Re-copy the FULL contents of ` +
        'sa_base64.txt (it should be a single very long line, ~2300+ characters) into the ' +
        'Vercel env var, save, and redeploy with `vercel --prod`.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // Optional — only needed if you upgrade to Blaze and want real Firebase
    // Storage. The default receipt flow stores PDFs as base64 in Firestore
    // instead, so this can be left unset on the free Spark plan.
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
  });

  return admin;
}

function db() {
  const app = initFirebase().app();

  // Most projects use the default Firestore database and don't need this.
  // If your Firebase Console shows a Database ID other than "(default)"
  // under Firestore Database, set FIRESTORE_DATABASE_ID in Vercel env vars
  // to that exact value — otherwise the Admin SDK looks for "(default)"
  // and Firestore calls fail with "5 NOT_FOUND".
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  if (databaseId && databaseId !== '(default)') {
    return getFirestore(app, databaseId);
  }
  return getFirestore(app);
}

// Kept for anyone who upgrades to Blaze and wants to switch back to real
// Storage — unused by the default (Firestore-based) receipt flow.
function bucket() {
  return initFirebase().storage().bucket();
}

module.exports = { initFirebase, db, bucket };
