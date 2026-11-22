/* Placeholder for a future purchase flow.
   After a buyer has this guide, earwiseLoadPurchasedScript(guideId) can fetch
   the remaining English script and render it into [data-script-source="purchase"].
   This build does not include those scripts and does not open checkout. */
(function () {
  window.earwiseLoadPurchasedScript = function (guideId) {
    return Promise.resolve(null);
  };
})();
