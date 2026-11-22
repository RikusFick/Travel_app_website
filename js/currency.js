/* Canonical charge-currency rules. Keep this file in sync with
   data/currency.json and worker/purchase/src/currency.json.
   The website shows euro prices and the note "Billed in ZAR".
   The Worker converts at the day's EUR to ZAR rate; 19.25 is only a fallback. */
window.EARWISE_CURRENCY = {
  "sourceCurrency": "EUR",
  "chargeCurrency": "ZAR",
  "fallbackRate": 19.25,
  "asOf": "2026-11-22",
  "rule": "Website shows euro prices. Paystack is billed in ZAR at the day's EUR to ZAR rate: ZAR cents = round(EUR price \u00d7 rate \u00d7 100). The Worker fetches the rate from frankfurter.app (ECB) with a fallback to open.er-api.com, caches it in KV for 24 hours, and uses 19.25 only if both fetches fail and there is no cache."
};

window.earwiseFormatEuro = function (eurPrice) {
  var eur = Math.round(Number(eurPrice) * 100) / 100;
  if (!isFinite(eur)) return "";
  return "€" + eur.toFixed(2);
};
