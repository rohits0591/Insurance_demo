// Stubbed SMS sender. Wire this up to Twilio / Gupshup / Airtel IQ / etc.
// for real delivery. For the demo, it just logs — the AI agent flow or you,
// the presenter, can read the "link" out loud or paste it in a browser.

async function sendSms(phone, message) {
  // eslint-disable-next-line no-console
  console.log(`[SMS STUB] To: ${phone} | Message: ${message}`);

  // Example real integration (Twilio) — uncomment and fill in creds:
  //
  // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   body: message,
  //   from: process.env.SMS_PROVIDER_SENDER_ID,
  //   to: phone,
  // });

  return { simulated: true, phone, message };
}

module.exports = { sendSms };
