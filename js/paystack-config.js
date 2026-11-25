/* Public Paystack LIVE key and the purchase Worker URL.
   The secret key must never go in this file — it lives only on the Worker
   (box env PAYSTACK_LIVE_SECRET_KEY, set as a wrangler secret at deploy).
   verifyUrl is the Worker, e.g. https://earwise-purchase.<subdomain>.workers.dev
   Charge currency lives in js/currency.js (and data/currency.json), not here. */
window.EARWISE_PAYSTACK = {
  publicKey: "pk_live_a8dbf1f1779b9e04277356de9f0cc44ec03a1b50",
  verifyUrl: "https://earwise-purchase.earwise.workers.dev"
};
