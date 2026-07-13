# Axis Max Life Insurance — Dummy Backend for WxCC Outbound AI Agent Demo

Backend for two Webex Contact Center outbound campaign + AI Agent demo use cases:

1. **Premium payment reminder** — AI agent reads out amount due, generates a dummy
   payment link, and once "paid," auto-generates + stores a PDF receipt whose
   download link gets sent to the customer's mobile.
2. **Policy renewal + cross-sell** — a scheduled job continuously watches policy
   renewal dates and fires a webhook to Webex/Acqueon the moment a policy enters
   the 7-day renewal window, so the outbound campaign/AI agent flow can be triggered.

Stack: **Node.js serverless functions on Vercel** + **Firebase (Firestore + Storage)**.

---

## 1. One-time setup

### 1.1 Firebase project
1. Create a project at https://console.firebase.google.com
2. Enable **Firestore** (Native mode). You do **not** need to enable Storage —
   receipt PDFs are stored as base64 directly inside Firestore documents, so
   everything runs on Firebase's free **Spark** plan. (Firebase Storage now
   requires the paid Blaze plan even for tiny usage; this project avoids that
   entirely. If you'd rather use real Storage, upgrade to Blaze, enable
   Storage, and see the "Switch to real Firebase Storage" note in section 6.)

   > **Check the Database ID:** on the Firestore Database page, look at the
   > **Database ID** shown near the top. If it says `(default)`, you're fine —
   > nothing extra to configure. If Firebase had you name it something else,
   > set `FIRESTORE_DATABASE_ID` to that exact value in Vercel env vars (see
   > `.env.example`), or your API calls will fail with a `5 NOT_FOUND` error.
3. Project Settings → Service Accounts → **Generate new private key** → downloads a JSON file.
4. Base64-encode it:
   ```bash
   base64 -i serviceAccountKey.json | tr -d '\n' > sa_base64.txt
   ```

### 1.2 Deploy to Vercel
```bash
npm i -g vercel
cd insurance-backend
vercel
```
Then in the Vercel project dashboard → **Settings → Environment Variables**, add everything
from `.env.example`:

| Variable | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | contents of `sa_base64.txt` |
| `API_KEY` | any strong random string — used to protect internal/agent-facing APIs |
| `BASE_URL` | your deployed URL, e.g. `https://insurance-demo.vercel.app` |
| `WEBEX_WEBHOOK_URL` | see section 3 |
| `WEBEX_WEBHOOK_AUTH_TOKEN` | optional, if your Webex/Acqueon endpoint needs a bearer token |

Redeploy after adding env vars: `vercel --prod`

> **Note on cron:** Vercel's free (Hobby) tier allows daily crons; Pro allows any frequency.
> `vercel.json` is set to run `check-renewals` daily at 03:00 UTC. During the demo you don't
> need to wait for the schedule — call the endpoint manually (see section 4).

### 1.3 Seed dummy data
```bash
curl -X POST https://<your-app>.vercel.app/api/customers \
  -H "x-api-key: <API_KEY>"
```
This creates 6 dummy policyholders — a mix of premium-due-soon, renewal-within-7-days,
and control records, so both demos have data to work against immediately. (Seeding is a
`POST` to the same `/api/customers` endpoint that `GET` uses to list them — merged into
one function to stay comfortably under Vercel's Hobby-plan function limit.)

---

## 2. Use case 1 — Premium payment reminder (agent-side flow)

**Step A** — WxCC AI Agent (via HTTP/webhook action in Flow Designer or Agent Studio)
looks up the customer:
```bash
curl https://<your-app>.vercel.app/api/policy/SLI-100234 \
  -H "x-api-key: <API_KEY>"
```
Returns name, premium amount, due date — the agent reads this out.

**Step B** — Customer confirms they want to pay now. Agent flow calls:
```bash
curl -X POST https://<your-app>.vercel.app/api/payment/create-link \
  -H "x-api-key: <API_KEY>" -H "Content-Type: application/json" \
  -d '{"policyNumber":"SLI-100234","sendSmsToCustomer":true}'
```
Returns a `paymentLink` (and, if `sendSmsToCustomer:true`, logs a stub SMS —
wire `lib/sms.js` to Twilio/Gupshup for real delivery). Agent reads/SMS's the link.

**Step C** — Customer opens the link (`/pay.html?paymentId=...`), clicks **Pay Now**.
This calls `/api/payment/complete`, which:
- marks the payment completed
- generates a PDF receipt (`lib/generateReceipt.js`)
- uploads it to Firebase Storage
- returns a receipt download link: `/api/receipt/<receiptId>`
- sends that link via the SMS stub

**Step D (optional)** — On a follow-up call, the agent can re-check status:
```bash
curl https://<your-app>.vercel.app/api/payment/<paymentId>
```

---

## 3. Use case 2 — Policy renewal + cross-sell (proactive monitor)

The cron job `api/cron/check-renewals.js` runs daily and:
1. Scans all `active` policyholders in Firestore
2. Flags anyone whose `renewalDate` falls within the next 7 days
3. Skips anyone already triggered in the last 24h (avoids duplicate campaign entries)
4. POSTs a webhook payload to `WEBEX_WEBHOOK_URL` with policy details + a recommended
   cross-sell add-on (rule-based on age band, see `lib/rules.js`)
5. Logs every trigger to Firestore (`renewal_triggers`) for audit/demo purposes

**Wiring `WEBEX_WEBHOOK_URL` — two options:**

- **Quick demo (before WxCC side is built):** point it at this project's own
  `/api/webex` (POST). Then check what arrived:
  ```bash
  curl https://<your-app>.vercel.app/api/webex -H "x-api-key: <API_KEY>"
  ```
  (Same URL handles both — POST receives payloads, GET lists the last 20 received.)
- **Real integration:** point it at whichever WxCC/Acqueon entry point you're using —
  e.g. a Webhook-triggered Flow in Flow Designer, an Acqueon Campaign Manager inbound
  API for adding a record to a call list, or a middleware endpoint you stand up in
  front of Acqueon's API.

**Pull-based alternative** — if Acqueon prefers to poll rather than receive pushes:
```bash
curl "https://<your-app>.vercel.app/api/campaign?days=7" \
  -H "x-api-key: <API_KEY>"
```
**Audit trail of past triggers:**
```bash
curl "https://<your-app>.vercel.app/api/campaign?log=true" \
  -H "x-api-key: <API_KEY>"
```

**Trigger manually during a live demo** (don't wait for the daily schedule):
```bash
curl https://<your-app>.vercel.app/api/cron/check-renewals
```

---

## 4. Full API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/customers` | x-api-key | List all policyholders |
| POST | `/api/customers` | x-api-key | Seed/reseed 6 dummy policyholders |
| GET | `/api/policy/:policyNumber` | x-api-key | Policy + premium/renewal details |
| POST | `/api/payment/create-link` | x-api-key | Create dummy payment link |
| GET | `/api/payment/:paymentId` | public | Payment status (used by pay.html) |
| POST | `/api/payment/complete` | public | Simulate gateway success + generate receipt |
| GET | `/api/receipt/:receiptId` | public | Download receipt PDF |
| GET/POST | `/api/cron/check-renewals` | public | Renewal scan + webhook trigger |
| GET | `/api/campaign?days=7` | x-api-key | Pull-based renewal dial list |
| GET | `/api/campaign?log=true` | x-api-key | Audit trail of fired triggers |
| POST | `/api/webex` | public | Mock Webex-side webhook receiver |
| GET | `/api/webex` | x-api-key | See what the mock receiver logged |

Only **10 serverless functions total** — comfortably under Vercel's Hobby-plan limit of 12,
with headroom for future additions (e.g. the `/api/debug/env-check` diagnostic endpoint
used during initial setup troubleshooting, which you can delete once things are stable).

`public` endpoints are customer-facing or receive-only by design (protected instead by
unguessable IDs / meant to be called by external systems like a payment gateway or Webex).
Everything else needs header `x-api-key: <API_KEY>`.

---

## 5. Enhancements included beyond the original ask

- **Idempotent payment completion** — clicking Pay Now twice won't double-generate receipts.
- **24h cooldown on renewal triggers** — prevents the same policy re-firing the webhook every
  time the cron runs if it stays inside the 7-day window.
- **Cross-sell recommendation engine** (`lib/rules.js`) — rule-based add-on suggestion by
  age band, so use case 2's AI agent has something concrete to pitch, not just a renewal notice.
- **Mock Webex receiver + event log** — lets you demo the full loop end-to-end even before
  the real WxCC Flow/Acqueon endpoint is wired up.
- **Pull-based campaign list endpoint** — in case Acqueon/your integration prefers polling
  over webhooks.
- **Auto-advance premium due date** on successful payment, so re-running the demo shows a
  clean next cycle.
- **CORS + API key middleware** shared across all functions (`lib/http.js`).

## 6. Things to swap before this touches real customers
- Real payment gateway (Razorpay/PayU/Stripe) instead of the simulated Pay Now button —
  their webhook has its own signature verification, replace the `/api/payment/complete`
  trust model accordingly.
- Real SMS/WhatsApp provider in `lib/sms.js`.
- Firestore security rules (currently accessed only via Admin SDK server-side, which is fine).
- Real underwriting/eligibility rules instead of the demo age-band mapping.
- **Switch to real Firebase Storage** (optional): if you outgrow storing receipts as base64
  in Firestore (e.g. much higher volume, or you want direct public CDN links), upgrade to
  Blaze, enable Storage, set `FIREBASE_STORAGE_BUCKET` in env vars, and swap
  `api/payment/complete.js` / `api/receipt/[receiptId].js` back to using `bucket()` from
  `lib/firebaseAdmin.js` (kept in the code for exactly this purpose) instead of the
  `pdfBase64` field.
