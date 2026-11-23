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

  function workerBase() {
    return String((window.EARWISE_PAYSTACK || {}).verifyUrl || "").replace(/\/+$/, "").replace(/\/(verify|quote)$/i, "");
  }

  function workerUrl(path) {
    return workerBase() + path;
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
        const stopCount = Number(row.stops) || 0;
        const allStops = [];
        for (let i = 1; i <= stopCount; i++) allStops.push(i);
        const languages = {};
        const src = row.languages || current.languages || {};
        Object.keys(src).forEach(function (code) {
          if (Array.isArray(src[code]) && src[code].length) {
            languages[code] = allStops.length ? allStops.slice() : src[code].slice();
          }
        });
        return {
          id: guideId,
          base: all.base || current.base,
          languages: languages,
          stops: stopCount || allStops.length,
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

  let buying = false;

  async function startBuy(guideId, price, title) {
    if (buying) return;
    buying = true;
    const btn = document.getElementById("buy-btn");
    if (btn) btn.disabled = true;
    const noteEl = document.getElementById("buy-note");
    const previousNote = noteEl ? noteEl.textContent : "";
    let paid = false;
    function release() {
      buying = false;
      if (btn) btn.disabled = false;
    }
    const auth = window.earwiseAuth;
    if (auth && auth.ready) await auth.ready();
    const user = auth && auth.currentUser && auth.currentUser();
    if (!user) {
      release();
      location.href = accountUrl();
      return;
    }
    if (!paystackConfigured()) {
      setNote("Test checkout is not connected yet. The Paystack public key and the purchase Worker URL still need to be set.");
      release();
      return;
    }
    const cfg = window.EARWISE_PAYSTACK;
    const token = auth.idToken ? await auth.idToken() : null;
    if (!token) {
      release();
      location.href = accountUrl();
      return;
    }
    setNote("Preparing checkout…");
    var quote;
    try {
      const res = await fetch(workerUrl("/quote"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ guideId: guideId })
      });
      quote = await res.json().catch(function () { return {}; });
      if (!res.ok || !quote.ok || !quote.reference || !quote.amount) {
        setNote((quote && quote.message) || "Checkout could not be prepared. Please try again.");
        release();
        return;
      }
    } catch (err) {
      setNote("Checkout could not be prepared. Please try again.");
      release();
      return;
    }
    try {
      await loadPaystack();
    } catch (err) {
      setNote("Could not load Paystack. Check your connection and try again.");
      release();
      return;
    }
    const handler = window.PaystackPop.setup({
      key: cfg.publicKey,
      email: user.email,
      amount: quote.amount,
      currency: quote.currency || "ZAR",
      ref: quote.reference,
      metadata: {
        custom_fields: [],
        guideId: guideId,
        uid: user.uid,
        title: title || guideId
      },
      callback: function (response) {
        paid = true;
        verifyAndUnlock(guideId, response && response.reference);
      },
      onClose: function () {
        if (!paid) setNote(previousNote);
        release();
      }
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
      const res = await fetch(workerUrl("/verify"), {
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
    btn.setAttribute("aria-describedby", "charge-note buy-note");
    const euro = price && window.earwiseFormatEuro ? window.earwiseFormatEuro(price) : (price ? ("€" + price.toFixed(2)) : "");
    const label = euro ? ("Buy — " + euro + " (test)") : "Buy (test)";
    btn.textContent = label;
    btn.addEventListener("click", function () {
      startBuy(guideId, price, title);
    });
    link.replaceWith(btn);
    var chargeNote = document.getElementById("charge-note");
    if (!chargeNote) {
      chargeNote = document.createElement("p");
      chargeNote.className = "fine charge-note";
      chargeNote.id = "charge-note";
      btn.insertAdjacentElement("afterend", chargeNote);
    }
    chargeNote.textContent = "Billed in ZAR";
    const note = document.getElementById("buy-note");
    if (note) {
      note.textContent = (euro ? ("The guide price is " + euro + ". ") : "") +
        "Checkout is billed in South African rand at the day's exchange rate; your bank converts. This is Paystack test checkout — no live charge. After payment, the full guide unlocks here in your browser. Offline listening stays in the Earwise app, signed in with the same account.";
    }
  }

  function fillMyGuides() {
    const list = document.getElementById("my-guide-list");
    if (!list) return;
    const auth = window.earwiseAuth;
    const user = auth && auth.currentUser && auth.currentUser();
    if (!user) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
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
