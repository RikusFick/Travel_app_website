# Earwise purchase Worker

Static GitHub Pages cannot hold the Paystack secret key. This Cloudflare Worker is the only place that key is used.

It does four jobs:

1. `POST /quote` — the website sends a Firebase ID token and a `guideId`. The Worker looks up the euro price, fetches (or reuses a 24-hour KV cache of) the day’s EUR to ZAR rate from frankfurter.app (ECB) with a fallback to open.er-api.com, computes `ZAR cents = round(EUR price × rate × 100)`, stores a short-lived quote in KV, and returns `{ reference, amount, currency }`. If the rate fetch fails and there is no cache, it uses the fallback rate 19.25 in `src/currency.json`.
2. `POST /verify` — the website sends the Paystack reference, `guideId`, and a Firebase ID token. The Worker checks the payment with Paystack, checks the signed-in user, and checks that the paid amount and currency match the stored quote, then stores the purchase.
3. `GET /me` — the website or the app sends a Firebase ID token and receives the list of guides that account owns.
4. `POST /webhook` — optional Paystack webhook (`charge.success`) so a purchase is still saved if the browser closes after payment (same quote check as `/verify`).

Purchases are stored in Cloudflare KV, key `user:<firebaseUid>`, as:

```json
{
  "guides": {
    "pompeii": {
      "guideId": "pompeii",
      "title": "Pompeii",
      "source": "paystack",
      "reference": "ew_…",
      "amount": 3831,
      "currency": "ZAR",
      "sourceAmount": 1.99,
      "sourceCurrency": "EUR",
      "rate": 19.25,
      "purchasedAt": "2026-11-22T20:00:00.000Z",
      "test": true
    }
  }
}
```

The app does not have Firebase or a cloud purchase store yet (unlocks today live only on the phone). Once the app signs in with the same Firebase email account, it should call `GET /me` with the ID token and grant those guides locally. Offline download stays app-only.

## Deploy later (not done in this branch)

Do not deploy until the test keys are in place.

1. Copy `../../data/prices.json` to `src/prices.json` and `../../data/currency.json` to `src/currency.json` if either has changed. Checkout is billed in ZAR at the day’s EUR to ZAR rate; `fallbackRate` (19.25) is used only if the rate fetch and the KV cache both fail.
2. Create KV: `wrangler kv namespace create ENTITLEMENTS` and paste the id into `wrangler.toml`.
3. Set secrets: `wrangler secret put PAYSTACK_SECRET_KEY` (use the test secret from the box env `PAYSTACK_TEST_SECRET_KEY`; never print or commit it) and `wrangler secret put FIREBASE_WEB_API_KEY`.
4. Set `[vars]` in `wrangler.toml`: `FIREBASE_PROJECT_ID=earwise-app`, `SITE_ORIGIN=https://getearwise.com`.
5. `wrangler deploy` and paste the Worker URL into `js/paystack-config.js` as `verifyUrl`.
6. In the Paystack dashboard (test mode), set the webhook URL to `https://<worker>/webhook` if you want the backup path.

Never put the Paystack secret key, a Firebase service account, or `CLOUDFLARE_API_TOKEN` in this repo or in website HTML.
