/* Public Paystack test key and the purchase Worker URL.
   Paste the TEST public key (pk_test_…) from the Paystack dashboard.
   The secret key must never go in this file — it lives only on the Worker.
   verifyUrl is the Worker, e.g. https://earwise-purchase.<subdomain>.workers.dev */
window.EARWISE_PAYSTACK = {
  publicKey: "YOUR_PAYSTACK_TEST_PUBLIC_KEY",
  verifyUrl: "YOUR_PURCHASE_WORKER_URL",
  currency: "EUR"
};
