/* Load and cache entitlements for the signed-in account from the purchase Worker. */
(function () {
  let cache = { uid: null, guides: {} };

  function configured() {
    const cfg = window.EARWISE_PAYSTACK || {};
    const url = String(cfg.verifyUrl || "");
    return url && url.indexOf("YOUR_") !== 0;
  }

  function baseUrl() {
    return String((window.EARWISE_PAYSTACK || {}).verifyUrl || "").replace(/\/+$/, "").replace(/\/verify$/i, "");
  }

  async function load() {
    const auth = window.earwiseAuth;
    const user = auth && auth.currentUser && auth.currentUser();
    if (!user || !configured()) {
      cache = { uid: user ? user.uid : null, guides: {} };
      return cache;
    }
    if (cache.uid === user.uid && cache.loaded) return cache;
    const token = await auth.idToken();
    const res = await fetch(baseUrl() + "/me", {
      headers: { Accept: "application/json", Authorization: "Bearer " + token }
    });
    const json = await res.json().catch(function () { return {}; });
    const guides = (json && json.guides) || {};
    cache = { uid: user.uid, guides: guides, loaded: true };
    return cache;
  }

  function owns(guideId) {
    return !!(cache.guides && cache.guides[guideId]);
  }

  function remember(guideId, record) {
    cache.guides = cache.guides || {};
    cache.guides[guideId] = record || { guideId: guideId };
    cache.loaded = true;
  }

  window.earwisePurchases = {
    configured: configured,
    load: load,
    owns: owns,
    remember: remember,
    list: function () { return cache.guides || {}; }
  };
})();
