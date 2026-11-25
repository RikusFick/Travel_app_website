# Earwise purchase Worker

Static GitHub Pages cannot hold the Paystack secret key. This Cloudflare Worker is the only place that key is used.

It does four jobs:

1. `POST /quote` — the website sends a Firebase ID token and a `guideId`. The Worker looks up the euro price, fetches (or reuses a 24-hour Cache API entry of) the day’s EUR to ZAR rate from frankfurter.app (ECB) with a fallback to open.er-api.com, computes `ZAR cents = round(EUR price × rate × 100)`, and returns `{ reference, amount, currency }`. The `reference` is a stateless HMAC-SHA256-signed quote (guide, euro cents, ZAR cents, rate, uid, expiry) so checkout does not write to KV. `/verify` and `/webhook` check the signature, expiry, and Paystack amount. A leftover `quote:<ref>` KV record is still accepted for about 30 minutes if one exists. If the rate fetch fails, the Worker reads the older KV `fx:EURZAR` key if present (read-only) or uses the fallback rate 19.25 in `src/currency.json`.
2. `POST /verify` — the website sends the Paystack reference, `guideId`, and a Firebase ID token. The Worker checks the payment with Paystack, checks the signed-in user, and checks that the paid amount and currency match the signed quote, then stores the purchase. If that guide is already recorded with the same reference, it does not write again.
3. `GET /me` — the website or the app sends a Firebase ID token and receives the list of guides that account owns. This path only reads KV.
4. `GET /script?guide=&lang=` — returns the read-along script for a guide in the requested language (falls back to English). Free guides are public; paid guides require a Firebase ID token and a stored purchase. Scripts live in the ENTITLEMENTS KV under `script:<guideId>:<lang>`, not in the public website. This path only reads KV.
5. `POST /webhook` — optional Paystack webhook (`charge.success`) so a purchase is still saved if the browser closes after payment (same signed-quote check as `/verify`, and the same idempotent entitlement write).

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

## Deploy

Deployed to `https://earwise-purchase.earwise.workers.dev`. Paystack live webhook URL: `https://earwise-purchase.earwise.workers.dev/webhook`.

1. Copy `../../data/prices.json` to `src/prices.json` and `../../data/currency.json` to `src/currency.json` if either has changed. Checkout is billed in ZAR at the day’s EUR to ZAR rate; `fallbackRate` (19.25) is used only if the rate fetch, the Cache API entry, and the read-only KV fallback all fail.
2. Create KV: `wrangler kv namespace create ENTITLEMENTS` and paste the id into `wrangler.toml`.
3. Set secrets: `wrangler secret put PAYSTACK_SECRET_KEY` (use the live secret from the box env `PAYSTACK_LIVE_SECRET_KEY`; never print or commit it), `wrangler secret put FIREBASE_WEB_API_KEY`, and `wrangler secret put QUOTE_SIGNING_KEY` (generate a random key and pipe it on stdin; never print or commit it).
4. Set `[vars]` in `wrangler.toml`: `FIREBASE_PROJECT_ID=earwise-app`, `SITE_ORIGIN=https://getearwise.com`.
5. `wrangler deploy` and paste the Worker URL into `js/paystack-config.js` as `verifyUrl`.
6. In the Paystack dashboard (live mode), set the webhook URL to `https://<worker>/webhook` if you want the backup path.

Never put the Paystack secret key, a Firebase service account, or `CLOUDFLARE_API_TOKEN` in this repo or in website HTML.
