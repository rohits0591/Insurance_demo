const { v4: uuidv4 } = require('uuid');
const { db } = require('../../lib/firebaseAdmin');
const { withCors, sendJson } = require('../../lib/http');
const { generateReceiptPdf } = require('../../lib/generateReceipt');
const { sendSms } = require('../../lib/sms');

// Fires a webhook to Webex Connect so a Connect flow can push the receipt
// link to the customer's mobile (WhatsApp/SMS). Failure here never fails
// the payment itself — it's logged for visibility instead.
async function triggerReceiptWebhook(payload) {
  const url = process.env.WEBEX_CONNECT_RECEIPT_WEBHOOK_URL;
  if (!url) {
    return { skipped: true, reason: 'WEBEX_CONNECT_RECEIPT_WEBHOOK_URL not configured' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.API_KEY) headers['x-api-key'] = process.env.API_KEY;
  if (process.env.WEBEX_CONNECT_RECEIPT_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.WEBEX_CONNECT_RECEIPT_AUTH_TOKEN}`;
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return { skipped: false, status: resp.status, ok: resp.ok };
  } catch (err) {
    return { skipped: false, ok: false, error: err.message };
  }
}

// POST /api/payment/complete
// Body: { "paymentId": "..." }
//
// NOTE: intentionally NOT protected by x-api-key — in a real integration
// this would be the *payment gateway's* server-to-server webhook (Razorpay/
// PayU/Stripe etc. all have their own signature verification instead).
// pay.html also calls this directly to simulate "Pay Now" being clicked.
//
// Flow: marks payment as completed -> generates receipt PDF -> stores it as
// base64 directly in the Firestore 'receipts' doc (no Firebase Storage /
// Blaze plan required — receipts are only a few KB) -> returns a
// downloadable receipt link -> fires a webhook to Webex Connect so a Connect
// flow can send that link to the customer's mobile over WhatsApp/SMS.
module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { paymentId } = req.body || {};
  if (!paymentId) {
    return sendJson(res, 400, { error: 'paymentId is required' });
  }

  try {
    const firestore = db();
    const paymentRef = firestore.collection('payments').doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      return sendJson(res, 404, { error: 'Payment not found' });
    }

    const payment = paymentDoc.data();

    if (payment.status === 'completed') {
      // Idempotent: already paid, just return existing receipt info.
      return sendJson(res, 200, {
        message: 'Payment already completed',
        receiptId: payment.receiptId,
        receiptUrl: `${process.env.BASE_URL || `https://${req.headers.host}`}/api/receipt/${payment.receiptId}`,
      });
    }

    const paidAt = new Date().toISOString();
    const receiptId = `RCPT-${uuidv4().slice(0, 8).toUpperCase()}`;
    const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

    // 1. Generate PDF
    const pdfBuffer = await generateReceiptPdf({
      receiptId,
      paymentId,
      policyNumber: payment.policyNumber,
      customerName: payment.customerName,
      policyType: payment.policyType,
      amount: payment.amount,
      paidAt,
    });

    // 2. Encode PDF as base64 (receipts are a few KB — well within Firestore's
    // 1MB document limit, so no Storage bucket / Blaze plan needed)
    const pdfBase64 = pdfBuffer.toString('base64');
    const receiptDownloadUrl = `${baseUrl}/api/receipt/${receiptId}`;

    // 3. Store receipt record (PDF content lives inline in this doc)
    await firestore.collection('receipts').doc(receiptId).set({
      receiptId,
      paymentId,
      policyNumber: payment.policyNumber,
      customerName: payment.customerName,
      amount: payment.amount,
      paidAt,
      pdfBase64,
      generatedAt: new Date().toISOString(),
    });

    // 4. Mark payment completed
    await paymentRef.update({
      status: 'completed',
      paidAt,
      receiptId,
    });

    // 5. Mark premium as paid on the policyholder record (moves due date forward)
    const policyRef = firestore.collection('policyholders').doc(payment.policyNumber);
    const policyDoc = await policyRef.get();
    if (policyDoc.exists) {
      const nextDue = new Date();
      nextDue.setMonth(nextDue.getMonth() + 1);
      await policyRef.update({
        lastPaymentAt: paidAt,
        premiumDueDate: nextDue.toISOString().slice(0, 10),
      });
    }

    // 6. "Send" receipt link via SMS stub
    await sendSms(
      payment.phone,
      `Payment of INR ${payment.amount} received for policy ${payment.policyNumber}. Download your receipt: ${receiptDownloadUrl}`
    );

    // 7. Fire webhook to Webex Connect so a Connect flow can push the
    // receipt link to the customer over WhatsApp/SMS.
    const webhookPayload = {
      eventType: 'PAYMENT_RECEIPT_READY',
      paymentId,
      receiptId,
      policyNumber: payment.policyNumber,
      customerName: payment.customerName,
      phone: payment.phone,
      amount: payment.amount,
      paidAt,
      receiptUrl: receiptDownloadUrl,
      triggeredAt: new Date().toISOString(),
    };

    const webhookResult = await triggerReceiptWebhook(webhookPayload);

    await firestore.collection('webhook_deliveries').add({
      ...webhookPayload,
      webhookResult,
    });

    return sendJson(res, 200, {
      message: 'Payment completed and receipt generated',
      paymentId,
      receiptId,
      receiptUrl: receiptDownloadUrl,
      paidAt,
      webhookResult,
    });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
