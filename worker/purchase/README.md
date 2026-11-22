# Earwise purchase Worker

Static GitHub Pages cannot hold the Paystack secret key. This Cloudflare Worker is the only place that key is used.

It does three jobs:

1. `POST /verify` — the website sends a Paystack reference and a Firebase ID token. The Worker checks the payment with Paystack, checks the signed-in user, checks the amount against `src/prices.json` converted by `src/currency.json`, and stores the purchase.
2. `GET /me` — the website or the app sends a Firebase ID token and receives the list of guides that account owns.
3. `POST /webhook` — optional Paystack webhook (`charge.success`) so a purchase is still saved if the browser closes after payment.

Purchases are stored in Cloudflare KV, key `user:<firebaseUid>`, as:

```json
{
  "guides": {
    "pompeii": {
      "guideId": "pompeii",
      "title": "Pompeii",
      "source": "paystack",
      "reference": "ew_…",
      "amount": 219,
      "currency": "USD",
      "sourceAmount": 1.99,
      "sourceCurrency": "EUR",
      "purchasedAt": "2026-11-22T20:00:00.000Z",
      "test": true
    }
  }
}
```

The app does not have Firebase or a cloud purchase store yet (unlocks today live only on the phone). Once the app signs in with the same Firebase email account, it should call `GET /me` with the ID token and grant those guides locally. Offline download stays app-only.

## Deploy later (not done in this branch)

Do not deploy until the test keys are in place.

1. Copy `../../data/prices.json` to `src/prices.json` and `../../data/currency.json` to `src/currency.json` if either has changed. `chargeCurrency` in those files is the single switch (USD by default, or ZAR).
2. Create KV: `wrangler kv namespace create ENTITLEMENTS` and paste the id into `wrangler.toml`.
3. Set secrets: `wrangler secret put PAYSTACK_SECRET_KEY` (use the test secret from the box env `PAYSTACK_TEST_SECRET_KEY`; never print or commit it) and `wrangler secret put FIREBASE_WEB_API_KEY`.
4. Set `[vars]` in `wrangler.toml`: `FIREBASE_PROJECT_ID=earwise-app`, `SITE_ORIGIN=https://getearwise.com`.
5. `wrangler deploy` and paste the Worker URL into `js/paystack-config.js` as `verifyUrl`.
6. In the Paystack dashboard (test mode), set the webhook URL to `https://<worker>/webhook` if you want the backup path.

Never put the Paystack secret key, a Firebase service account, or `CLOUDFLARE_API_TOKEN` in this repo or in website HTML.
