const { db } = require('../../lib/firebaseAdmin');
const { requireApiKey, sendJson } = require('../../lib/http');

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// A spread of dummy policyholders: some with premium due soon (use case 1),
// some with renewal due within 7 days (use case 2), some neither (control group).
const DUMMY_POLICYHOLDERS = [
  {
    policyNumber: 'SLI-100234',
    name: 'Rohit Sharma',
    phone: '+919810000001',
    email: 'rohit.sharma@example.com',
    policyType: 'Term Life',
    ageBand: '31-45',
    sumAssured: 5000000,
    premiumAmount: 12500,
    premiumDueDate: addDays(2),
    renewalDate: addDays(40),
    status: 'active',
  },
  {
    policyNumber: 'SLI-100235',
    name: 'Ananya Iyer',
    phone: '+919810000002',
    email: 'ananya.iyer@example.com',
    policyType: 'Health Insurance',
    ageBand: '18-30',
    sumAssured: 1000000,
    premiumAmount: 8200,
    premiumDueDate: addDays(5),
    renewalDate: addDays(4),
    status: 'active',
  },
  {
    policyNumber: 'SLI-100236',
    name: 'Vikram Malhotra',
    phone: '+919810000003',
    email: 'vikram.malhotra@example.com',
    policyType: 'Motor Insurance',
    ageBand: '46-60',
    sumAssured: 800000,
    premiumAmount: 6400,
    premiumDueDate: addDays(1),
    renewalDate: addDays(6),
    status: 'active',
  },
  {
    policyNumber: 'SLI-100237',
    name: 'Sunita Reddy',
    phone: '+919810000004',
    email: 'sunita.reddy@example.com',
    policyType: 'Health Insurance',
    ageBand: '60+',
    sumAssured: 1500000,
    premiumAmount: 15800,
    premiumDueDate: addDays(3),
    renewalDate: addDays(2),
    status: 'active',
  },
  {
    policyNumber: 'SLI-100238',
    name: 'Karan Mehta',
    phone: '+919810000005',
    email: 'karan.mehta@example.com',
    policyType: 'Term Life',
    ageBand: '31-45',
    sumAssured: 3000000,
    premiumAmount: 9800,
    premiumDueDate: addDays(15),
    renewalDate: addDays(90),
    status: 'active',
  },
  {
    policyNumber: 'SLI-100239',
    name: 'Priya Nair',
    phone: '+919810000006',
    email: 'priya.nair@example.com',
    policyType: 'Motor Insurance',
    ageBand: '18-30',
    sumAssured: 600000,
    premiumAmount: 4200,
    premiumDueDate: addDays(4),
    renewalDate: addDays(7),
    status: 'active',
  },
];

// GET /api/customers
//   Returns all dummy policyholders — useful for building the Acqueon
//   outbound campaign dial list in the demo.
//
// POST /api/customers  (formerly a separate /api/seed endpoint)
//   Seeds/reseeds the 6 dummy policyholders. Safe to call repeatedly
//   (upserts by policyNumber).
//
// Both require header x-api-key.
module.exports = async (req, res) => {
  if (!requireApiKey(req, res)) return;

  if (req.method === 'GET') {
    try {
      const snapshot = await db().collection('policyholders').get();
      const customers = snapshot.docs.map((d) => d.data());
      return sendJson(res, 200, { count: customers.length, customers });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const firestore = db();
      const batch = firestore.batch();

      DUMMY_POLICYHOLDERS.forEach((p) => {
        const ref = firestore.collection('policyholders').doc(p.policyNumber);
        batch.set(ref, { ...p, lastRenewalTriggerAt: null }, { merge: true });
      });

      await batch.commit();

      return sendJson(res, 200, {
        message: `Seeded ${DUMMY_POLICYHOLDERS.length} dummy policyholders.`,
        policyholders: DUMMY_POLICYHOLDERS.map((p) => p.policyNumber),
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
