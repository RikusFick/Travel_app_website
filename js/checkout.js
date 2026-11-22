/* Paystack test checkout for a paid guide, then server verify + on-page unlock. */
(function () {
  function paystackConfigured() {
    const cfg = window.EARWISE_PAYSTACK || {};
    const key = String(cfg.publicKey || "");
    const url = String(cfg.verifyUrl || "");
    return key && key.indexOf("YOUR_") !== 0 && url && url.indexOf("YOUR_") !== 0;
  }

  function pageGuideId() {
    const dataEl = document.getElementById("earwise-audio");
    if (dataEl) {
      try {
        const data = JSON.parse(dataEl.textContent);
        if (data && data.id) return data.id;
      } catch (err) { /* ignore */ }
    }
    const parts = location.pathname.replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || "";
  }

  function parseEuroPrice() {
    const el = document.querySelector(".hero-copy .price, p.price, .price");
    const text = el ? el.textContent : "";
    const m = text.replace(",", ".").match(/([0-9]+(?:\.[0-9]+)?)/);
    return m ? Number(m[1]) : 0;
  }

  function isFreeGuide() {
    const note = document.getElementById("buy-note");
    if (note && /this guide is free/i.test(note.textContent)) return true;
    const price = document.querySelector(".hero-copy .price, p.price, .price");
    if (price && /free/i.test(price.textContent)) return true;
    const dataEl = document.getElementById("earwise-audio");
    if (dataEl) {
      try {
        const data = JSON.parse(dataEl.textContent);
        if (data && data.mode === "full") return true;
      } catch (err) { /* ignore */ }
    }
    return false;
  }

  function accountUrl() {
    const link = document.querySelector("#site-nav a[href$='account.html']") ||
      document.querySelector("a[data-auth-link]");
    const href = link ? link.getAttribute("href") : "../account.html";
    const next = location.pathname + location.search + location.hash;
    const sep = href.indexOf("?") >= 0 ? "&" : "?";
    return href + sep + "next=" + encodeURIComponent(next);
  }

  function setNote(text) {
    const note = document.getElementById("buy-note");
    if (note) {
      note.textContent = text;
    }
  }

  function verifyUrl() {
    return String((window.EARWISE_PAYSTACK || {}).verifyUrl || "").replace(/\/+$/, "").replace(/\/verify$/i, "") + "/verify";
  }

  async function audioInfo(guideId) {
    const dataEl = document.getElementById("earwise-audio");
    let current = {};
    try { current = JSON.parse(dataEl.textContent); } catch (err) { current = {}; }
    const res = await fetch("/data/audio.json", { headers: { Accept: "application/json" } });
    if (res.ok) {
      const all = await res.json();
      const row = all.guides && all.guides[guideId];
      if (row) {
        return {
          id: guideId,
          base: all.base || current.base,
          languages: row.languages,
          stops: row.stops,
          mode: "full"
        };
      }
    }
    return current.id ? current : null;
  }

  async function unlockGuide(guideId) {
    const info = await audioInfo(guideId);
    if (info && typeof window.earwiseUnlockGuideAudio === "function") {
      window.earwiseUnlockGuideAudio(info);
    }
    const lang = (document.getElementById("audio-lang-select") || {}).value || "en";
    if (typeof window.earwiseLoadPurchasedScript === "function") {
      window.earwiseLoadPurchasedScript(guideId, lang);
    }
    const block = document.querySelector(".buy-block");
    if (block) {
      const btn = block.querySelector(".btn");
      if (btn) {
        btn.textContent = "You own this guide";
        btn.setAttribute("aria-disabled", "true");
        if (btn.tagName === "A") {
          btn.removeAttribute("href");
          btn.setAttribute("role", "button");
        }
        btn.classList.add("is-owned");
      }
      setNote("This guide is unlocked on your account. Play every stop here in the browser. Offline listening and GPS auto-play stay in the Earwise app, signed in with the same account.");
    }
  }

  function loadPaystack() {
    if (window.PaystackPop) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("paystack")); };
      document.head.appendChild(s);
    });
  }

  async function startBuy(guideId, price, title) {
    const auth = window.earwiseAuth;
    const user = auth && auth.currentUser && auth.currentUser();
    if (!user) {
      location.href = accountUrl();
      return;
    }
    if (!paystackConfigured()) {
      setNote("Test checkout is not connected yet. The Paystack public key and the purchase Worker URL still need to be set.");
      return;
    }
    const cfg = window.EARWISE_PAYSTACK;
    const amount = Math.round(price * 100);
    const currency = cfg.currency || "EUR";
    const ref = "ew_" + user.uid.slice(0, 12) + "_" + guideId.replace(/[^a-z0-9-]/gi, "") + "_" + Date.now();
    try {
      await loadPaystack();
    } catch (err) {
      setNote("Could not load Paystack. Check your connection and try again.");
      return;
    }
    const handler = window.PaystackPop.setup({
      key: cfg.publicKey,
      email: user.email,
      amount: amount,
      currency: currency,
      ref: ref,
      metadata: {
        custom_fields: [],
        guideId: guideId,
        uid: user.uid,
        title: title || guideId
      },
      callback: function (response) {
        verifyAndUnlock(guideId, response && response.reference);
      },
      onClose: function () { /* buyer closed the popup */ }
    });
    handler.openIframe();
  }

  async function verifyAndUnlock(guideId, reference) {
    setNote("Confirming your payment…");
    const auth = window.earwiseAuth;
    const token = auth && auth.idToken ? await auth.idToken() : null;
    if (!token || !reference) {
      setNote("Payment could not be confirmed. Please email hello@getearwise.com.");
      return;
    }
    try {
      const res = await fetch(verifyUrl(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ reference: reference, guideId: guideId })
      });
      const json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) {
        setNote((json && json.message) || "Payment could not be confirmed. Please email hello@getearwise.com.");
        return;
      }
      if (window.earwisePurchases) window.earwisePurchases.remember(guideId, json.purchase || { guideId: guideId, reference: reference });
      await unlockGuide(guideId);
    } catch (err) {
      setNote("Payment could not be confirmed. Please email hello@getearwise.com.");
    }
  }

  function enhanceBuyBlock(user) {
    const block = document.querySelector(".buy-block");
    if (!block || isFreeGuide()) return;
    const guideId = pageGuideId();
    if (!guideId) return;
    const price = parseEuroPrice();
    const titleEl = document.querySelector(".hero-copy h1, h1");
    const title = titleEl ? titleEl.textContent.replace(/\s+audio guide$/i, "").trim() : guideId;
    const link = block.querySelector("a.btn, button.btn");
    if (!link) return;

    if (window.earwisePurchases && window.earwisePurchases.owns(guideId)) {
      unlockGuide(guideId);
      return;
    }

    if (!paystackConfigured()) return;
    if (block.dataset.enhanced === "1") return;
    block.dataset.enhanced = "1";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-block";
    btn.id = "buy-btn";
    btn.setAttribute("aria-describedby", "buy-note");
    const label = price ? ("Buy — €" + price.toFixed(2) + " (test)") : "Buy (test)";
    btn.textContent = label;
    btn.addEventListener("click", function () {
      if (!user) {
        location.href = accountUrl();
        return;
      }
      startBuy(guideId, price, title);
    });
    link.replaceWith(btn);
    const note = document.getElementById("buy-note");
    if (note) {
      note.textContent = "The guide price is €" + (price ? price.toFixed(2) : "—") +
        ". This is Paystack test checkout — no live charge. After payment, the full guide unlocks here in your browser. Offline listening stays in the Earwise app, signed in with the same account.";
    }
  }

  function fillMyGuides() {
    const list = document.getElementById("my-guide-list");
    if (!list) return;
    const guides = (window.earwisePurchases && window.earwisePurchases.list()) || {};
    const ids = Object.keys(guides);
    if (!ids.length) {
      list.innerHTML = "<p><strong>No guides yet.</strong></p><p class=\"muted\">Guides you buy on this website will show here, and unlock in the Earwise app when you sign in with the same account.</p>";
      return;
    }
    list.innerHTML = "<ul class=\"my-guide-links\">" + ids.map(function (id) {
      const rec = guides[id] || {};
      const href = "/" + encodeURIComponent(id) + "/";
      const label = rec.title || id;
      return "<li><a href=\"" + href + "\">" + label + "</a></li>";
    }).join("") + "</ul>";
  }

  function start() {
    const auth = window.earwiseAuth;
    if (!auth || !auth.onUser) {
      enhanceBuyBlock(null);
      return;
    }
    auth.onUser(function (user) {
      const purchases = window.earwisePurchases;
      const task = purchases && purchases.load ? purchases.load() : Promise.resolve();
      task.then(function () {
        enhanceBuyBlock(user);
        fillMyGuides();
      }).catch(function () {
        enhanceBuyBlock(user);
        fillMyGuides();
      });
    });
  }

  function whenAuthReady(fn) {
    if (window.earwiseAuth) fn();
    else window.addEventListener("earwise-auth-ready", fn, { once: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { whenAuthReady(start); });
  } else {
    whenAuthReady(start);
  }
})();
