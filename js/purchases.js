/* Load and cache entitlements for the signed-in account from the purchase Worker.
   A per-uid copy in localStorage lets My guides and Buy/owned UI paint before /me returns.
   Cached ownership is UI-only; it is never treated as a secret or a server proof. */
(function () {
  let cache = { uid: null, guides: {}, loaded: false, fromCache: false };
  let inflight = null;

  function configured() {
    const cfg = window.EARWISE_PAYSTACK || {};
    const url = String(cfg.verifyUrl || "");
    return url && url.indexOf("YOUR_") !== 0;
  }

  function baseUrl() {
    return String((window.EARWISE_PAYSTACK || {}).verifyUrl || "").replace(/\/+$/, "").replace(/\/verify$/i, "");
  }

  function persist() {
    if (!cache.uid || !window.earwiseSession || !window.earwiseSession.writeMe) return;
    window.earwiseSession.writeMe(cache.uid, { guides: cache.guides || {} });
  }

  function hydrate(uid) {
    const session = window.earwiseSession;
    if (!uid && session && session.readHint) {
      const hint = session.readHint();
      uid = hint && hint.uid;
    }
    if (!uid || !session || !session.readMe) return cache;
    const stored = session.readMe(uid);
    if (!stored || !stored.guides) return cache;
    if (cache.loaded && cache.uid === uid && !cache.fromCache) return cache;
    cache = { uid: uid, guides: stored.guides, loaded: false, fromCache: true };
    return cache;
  }

  function clear() {
    cache = { uid: null, guides: {}, loaded: false, fromCache: false };
  }

  async function load() {
    hydrate();
    const auth = window.earwiseAuth;
    if (auth && auth.ready) await auth.ready();
    const user = auth && auth.currentUser && auth.currentUser();
    if (!user) {
      clear();
      return cache;
    }
    if (cache.uid !== user.uid) hydrate(user.uid);
    if (!configured()) {
      cache.uid = user.uid;
      return cache;
    }
    if (cache.uid === user.uid && cache.loaded && !cache.fromCache) return cache;
    if (inflight && inflight.uid === user.uid) return inflight.promise;
    const task = (async function () {
      const token = await auth.idToken();
      if (!token) return cache;
      const res = await fetch(baseUrl() + "/me", {
        headers: { Accept: "application/json", Authorization: "Bearer " + token }
      });
      const json = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        cache = {
          uid: user.uid,
          guides: cache.uid === user.uid ? (cache.guides || {}) : {},
          loaded: false,
          fromCache: cache.uid === user.uid ? cache.fromCache : false
        };
        return cache;
      }
      const guides = (json && json.guides) || {};
      cache = { uid: user.uid, guides: guides, loaded: true, fromCache: false };
      persist();
      return cache;
    })();
    inflight = { uid: user.uid, promise: task };
    try {
      return await task;
    } finally {
      if (inflight && inflight.promise === task) inflight = null;
    }
  }

  function owns(guideId) {
    if (cache.guides && cache.guides[guideId]) return true;
    if (cache.uid && cache.loaded && !cache.fromCache) return false;
    hydrate();
    return !!(cache.guides && cache.guides[guideId]);
  }

  function remember(guideId, record) {
    const session = window.earwiseSession;
    const hint = session && session.readHint && session.readHint();
    const auth = window.earwiseAuth;
    const user = auth && auth.currentUser && auth.currentUser();
    const uid = (user && user.uid) || (hint && hint.uid) || cache.uid;
    cache.guides = cache.guides || {};
    cache.guides[guideId] = record || { guideId: guideId };
    cache.uid = uid || cache.uid;
    cache.loaded = true;
    cache.fromCache = false;
    persist();
  }

  hydrate();

  window.earwisePurchases = {
    configured: configured,
    load: load,
    hydrate: hydrate,
    clear: clear,
    owns: owns,
    remember: remember,
    list: function () { return cache.guides || {}; },
    isFresh: function () { return !!(cache.loaded && !cache.fromCache); }
  };
})();
