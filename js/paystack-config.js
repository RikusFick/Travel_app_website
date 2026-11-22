/* Public Paystack TEST key and the purchase Worker URL.
   The secret key must never go in this file — it lives only on the Worker
   (box env PAYSTACK_TEST_SECRET_KEY, set as a wrangler secret at deploy).
   verifyUrl is the Worker, e.g. https://earwise-purchase.<subdomain>.workers.dev
   Charge currency lives in js/currency.js (and data/currency.json), not here. */
window.EARWISE_PAYSTACK = {
  publicKey: "pk_test_22ecdf07cdec2000b3cee4cfc9c592b3db4253a1",
  verifyUrl: "https://earwise-purchase.earwise.workers.dev"
};
