/* Paystack checkout for a paid guide, then server verify + on-page unlock. */
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

  let priceById = null;

  function loadPriceCatalog() {
    if (priceById) return Promise.resolve(priceById);
    return fetch("/data/prices.json", { headers: { Accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        priceById = {};
        ((data && data.guides) || []).forEach(function (row) {
          if (row && row.id) priceById[row.id] = row;
        });
        return priceById;
      })
      .catch(function () {
        priceById = {};
        return priceById;
      });
  }

  function isFreeGuide() {
    const block = document.querySelector(".buy-block");
    if (block && block.classList.contains("buy-free")) return true;
    const note = document.getElementById("buy-note");
    if (note && /this guide is free/i.test(note.textContent)) return true;
    const price = document.querySelector(".hero-copy .price");
    if (price && /^\s*free\s*$/i.test(price.textContent)) return true;
    const row = priceById && priceById[pageGuideId()];
    if (row && (row.free === true || Number(row.price) === 0)) return true;
    return false;
  }

  function siteHref(file) {
    const account = (window.earwiseSession && window.earwiseSession.accountHref && window.earwiseSession.accountHref()) || "account.html";
    return String(account).replace(/account\.html(?:[?#].*)?$/, file);
  }

  function accountUrl() {
    const link = document.querySelector("#site-nav a[href$='account.html']") ||
      document.querySelector("a[data-auth-link]");
    const href = (window.earwiseSession && window.earwiseSession.accountHref && window.earwiseSession.accountHref()) ||
      (link ? link.getAttribute("href") : "../account.html");
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

  function markOwned() {
    const block = document.querySelector(".buy-block");
    if (!block) return;
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
    const mine = siteHref("my-guides.html");
    setNote("Play every stop here.");
    setStatus('You own this guide. <a href="' + mine + '">My guides</a>');
  }

  function setStatus(html, isError) {
    let el = document.getElementById("buy-status");
    const block = document.querySelector(".buy-block");
    if (!el && block) {
      el = document.createElement("p");
      el.id = "buy-status";
      el.className = "buy-status";
      el.setAttribute("role", "status");
      block.appendChild(el);
    }
    if (!el) return;
    el.hidden = !html;
    el.classList.toggle("is-error", !!isError);
    el.innerHTML = html || "";
  }

  async function unlockGuide(guideId) {
    markOwned();
    const info = await audioInfo(guideId);
    if (info && typeof window.earwiseUnlockGuideAudio === "function") {
      window.earwiseUnlockGuideAudio(info);
    }
    const lang = (document.getElementById("audio-lang-select") || {}).value || "en";
    if (typeof window.earwiseLoadPurchasedScript === "function") {
      window.earwiseLoadPurchasedScript(guideId, lang);
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
        setStatus((quote && quote.message) || "Checkout could not start. Try again.", true);
        release();
        return;
      }
    } catch (err) {
      setStatus("Checkout could not start. Check your connection and try again.", true);
      release();
      return;
    }
    try {
      await loadPaystack();
    } catch (err) {
      setStatus("Could not open Paystack. Check your connection and try again.", true);
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
        if (!paid) {
          const fail = siteHref("purchase-failed.html") + "?guide=" + encodeURIComponent(guideId);
          setStatus('Payment was not completed. Try again, or <a href="' + fail + '">see what to do</a>.', true);
          release();
        }
      }
    });
    handler.openIframe();
  }

  async function verifyAndUnlock(guideId, reference) {
    setNote("Confirming your payment…");
    const auth = window.earwiseAuth;
    const token = auth && auth.idToken ? await auth.idToken() : null;
    if (!token || !reference) {
      const fail = siteHref("purchase-failed.html") + "?guide=" + encodeURIComponent(guideId);
      setStatus('Payment could not be confirmed. <a href="' + fail + '">Try again</a>.', true);
      buying = false;
      const btn = document.getElementById("buy-btn");
      if (btn) btn.disabled = false;
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
        const fail = siteHref("purchase-failed.html") + "?guide=" + encodeURIComponent(guideId);
        setStatus(((json && json.message) || "Payment could not be confirmed.") + ' <a href="' + fail + '">Try again</a>.', true);
        buying = false;
        const btn = document.getElementById("buy-btn");
        if (btn) btn.disabled = false;
        return;
      }
      if (window.earwisePurchases) window.earwisePurchases.remember(guideId, json.purchase || { guideId: guideId, title: titleFromPage(), reference: reference });
      await unlockGuide(guideId);
      const done = siteHref("purchase-success.html") + "?guide=" + encodeURIComponent(guideId) + "&reference=" + encodeURIComponent(reference);
      setStatus('Payment received. <a href="' + done + '">View receipt</a>');
    } catch (err) {
      const fail = siteHref("purchase-failed.html") + "?guide=" + encodeURIComponent(guideId);
      setStatus('Payment could not be confirmed. <a href="' + fail + '">Try again</a>.', true);
      buying = false;
      const btn = document.getElementById("buy-btn");
      if (btn) btn.disabled = false;
    }
  }

  function titleFromPage() {
    const titleEl = document.querySelector(".hero-copy h1, h1");
    return titleEl ? titleEl.textContent.replace(/\s+audio guide$/i, "").trim() : pageGuideId();
  }

  function showFree(block) {
    block.classList.add("buy-free");
    ["buy-btn", "test-mode-note", "charge-note"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    const link = block.querySelector("a[href^='mailto:']");
    if (link) link.remove();
    if (!block.querySelector(".free-state")) {
      const line = document.createElement("p");
      line.className = "free-state";
      line.textContent = "This guide is free";
      block.insertBefore(line, block.firstChild);
    }
    const note = document.getElementById("buy-note");
    if (note) note.textContent = "Every recorded stop plays here.";
  }

  function enhanceBuyBlock() {
    const block = document.querySelector(".buy-block");
    if (!block) return;
    const guideId = pageGuideId();
    if (!guideId) return;
    if (isFreeGuide()) {
      showFree(block);
      return;
    }
    if (window.earwisePurchases && window.earwisePurchases.owns(guideId)) {
      unlockGuide(guideId);
      return;
    }
    const price = parseEuroPrice();
    const row = priceById && priceById[guideId];
    const amount = price || (row && Number(row.price)) || 0;
    const euro = amount && window.earwiseFormatEuro ? window.earwiseFormatEuro(amount) : (amount ? ("€" + amount.toFixed(2)) : "");
    const title = titleFromPage();
    let btn = document.getElementById("buy-btn");
    const link = block.querySelector("a.btn, a[href^='mailto:']");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-block";
      btn.id = "buy-btn";
      if (link) link.replaceWith(btn);
      else block.insertBefore(btn, block.firstChild);
    } else if (link) {
      link.remove();
    }
    if (euro) btn.textContent = "Buy — " + euro;
    btn.setAttribute("aria-describedby", "charge-note buy-note");
    if (!document.getElementById("charge-note")) {
      const charge = document.createElement("p");
      charge.className = "fine charge-note";
      charge.id = "charge-note";
      charge.textContent = "Billed in ZAR";
      btn.insertAdjacentElement("afterend", charge);
    }
    if (block.dataset.enhanced !== "1") {
      block.dataset.enhanced = "1";
      btn.addEventListener("click", function () {
        startBuy(guideId, amount, title);
      });
    }
    if (!priceById) {
      loadPriceCatalog().then(function () { enhanceBuyBlock(); });
    }
  }

  function fillMyGuides() {
    const list = document.getElementById("my-guide-list");
    if (!list) return;
    const auth = window.earwiseAuth;
    const user = auth && auth.currentUser && auth.currentUser();
    const ready = auth && auth.isReady ? auth.isReady() : !!(user);
    const hint = window.earwiseSession && window.earwiseSession.readHint && window.earwiseSession.readHint();
    if (ready && !user) {
      list.hidden = true;
      return;
    }
    if (!user && !hint) {
      list.hidden = true;
      return;
    }
    if (window.earwisePurchases && window.earwisePurchases.hydrate) {
      window.earwisePurchases.hydrate((user && user.uid) || (hint && hint.uid));
    }
    list.hidden = false;
    const guides = (window.earwisePurchases && window.earwisePurchases.list()) || {};
    const ids = Object.keys(guides);
    const fresh = window.earwisePurchases && window.earwisePurchases.isFresh && window.earwisePurchases.isFresh();
    if (!ids.length) {
      if (!fresh && !(window.earwiseSession && window.earwiseSession.renderGuideList)) {
        list.innerHTML = "<p class=\"muted\">Loading your guides…</p>";
        return;
      }
      if (window.earwiseSession && window.earwiseSession.renderGuideList && fresh) {
        window.earwiseSession.renderGuideList(list, {});
        return;
      }
      if (!fresh) {
        list.innerHTML = "<p class=\"muted\">Loading your guides…</p>";
        return;
      }
    }
    if (window.earwiseSession && window.earwiseSession.renderGuideList) {
      window.earwiseSession.renderGuideList(list, guides);
      return;
    }
    list.innerHTML = "<ul class=\"my-guide-links\">" + ids.map(function (id) {
      const rec = guides[id] || {};
      const href = "/" + encodeURIComponent(id) + "/";
      const label = rec.title || id;
      return "<li><a href=\"" + href + "\">" + label + "</a></li>";
    }).join("") + "</ul>";
  }

  function applyPurchases(user) {
    const purchases = window.earwisePurchases;
    const task = purchases && purchases.load ? purchases.load() : Promise.resolve();
    task.then(function () {
      enhanceBuyBlock(user);
      fillMyGuides();
    }).catch(function () {
      enhanceBuyBlock(user);
      fillMyGuides();
    });
  }

  function hookAuth() {
    const auth = window.earwiseAuth;
    if (!auth || !auth.onUser) return;
    auth.onUser(function () {
      applyPurchases();
    });
  }

  function escText(text) {
    return String(text || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function receiptCard(opts) {
    const title = opts.title || "";
    const guideId = opts.guideId || "";
    const fallback = "img/hero-desktop.jpg";
    const src = guideId ? ("img/guides/" + encodeURIComponent(guideId) + ".jpg") : fallback;
    const niceTitle = title && title !== "this guide";
    const alt = niceTitle ? escText(title) : "Mont-Saint-Michel at sunrise";
    const eyebrow = niceTitle ? '<p class="eyebrow">' + escText(title) + "</p>" : "";
    return (
      '<article class="pay-card">' +
        '<div class="pay-photo"><img src="' + src + '" alt="' + alt + '" width="960" height="640"></div>' +
        '<div class="pay-copy">' +
          eyebrow +
          "<h1>" + opts.heading + "</h1>" +
          "<p>" + opts.body + "</p>" +
          (opts.actions ? '<p class="actions-row">' + opts.actions + "</p>" : "") +
          (opts.extra || "") +
        "</div>" +
      "</article>"
    );
  }

  function bindReceiptPhoto(root) {
    const img = root.querySelector(".pay-photo img");
    if (!img) return;
    img.addEventListener("error", function () {
      img.src = "img/hero-desktop.jpg";
      img.alt = "Mont-Saint-Michel at sunrise";
    }, { once: true });
  }

  async function handleReceiptPage() {
    const root = document.getElementById("purchase-result");
    if (!root) return;
    const params = new URLSearchParams(location.search);
    const guideId = params.get("guide") || "";
    const reference = params.get("reference") || "";
    const failed = root.getAttribute("data-kind") === "failed";
    await loadPriceCatalog();
    const row = priceById && priceById[guideId];
    const title = (row && row.title) || guideId || "this guide";
    const play = guideId ? ("/" + encodeURIComponent(guideId) + "/") : "guides/";
    const buy = guideId ? (play + "#buy-btn") : "guides/";
    function show(html) {
      root.innerHTML = html;
      bindReceiptPhoto(root);
    }
    function failedCard() {
      const preview = guideId
        ? '<p class="fine"><a href="' + play + '">Listen to the free preview meanwhile</a></p>'
        : "";
      return receiptCard({
        guideId: guideId,
        title: title,
        heading: "No worries, nothing was charged",
        body: "You weren't charged. You can try again whenever you're ready.",
        actions:
          '<a class="btn" href="' + buy + '">Try again</a>' +
          '<a class="btn btn-ghost" href="' + play + '">Back to the guide</a>',
        extra: preview + '<p class="fine">Need a hand? <a href="mailto:hello@getearwise.com">hello@getearwise.com</a></p>'
      });
    }
    function successCard(body) {
      return receiptCard({
        guideId: guideId,
        title: title,
        heading: "You're all set",
        body: body,
        actions:
          '<a class="btn" href="' + play + '">Play it</a>' +
          '<a class="btn btn-ghost" href="' + siteHref("my-guides.html") + '">My guides</a>'
      });
    }
    if (failed) {
      show(failedCard());
      return;
    }
    if (!reference) {
      show(successCard("Open the guide to start listening."));
      return;
    }
    const auth = window.earwiseAuth;
    if (auth && auth.ready) await auth.ready();
    const user = auth && auth.currentUser && auth.currentUser();
    const token = user && auth.idToken ? await auth.idToken() : null;
    if (!token) {
      const next = location.pathname + location.search;
      show(receiptCard({
        guideId: guideId,
        title: title,
        heading: "Log in to finish",
        body: "Log in so we can unlock this guide on this device.",
        actions: '<a class="btn" href="' + siteHref("account.html") + "?next=" + encodeURIComponent(next) + '">Log in</a>'
      }));
      return;
    }
    try {
      const res = await fetch(workerUrl("/verify"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ reference: reference, guideId: guideId })
      });
      const json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) {
        show(failedCard());
        return;
      }
      if (window.earwisePurchases) window.earwisePurchases.remember(guideId, json.purchase || { guideId: guideId, title: title, reference: reference });
      show(successCard(escText(title) + " is ready to play."));
    } catch (err) {
      show(failedCard());
    }
  }

  function start() {
    if (window.earwisePurchases && window.earwisePurchases.hydrate) {
      window.earwisePurchases.hydrate();
    }
    handleReceiptPage();
    enhanceBuyBlock();
    fillMyGuides();
    hookAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
    if (!window.earwiseAuth) window.addEventListener("earwise-auth-ready", hookAuth, { once: true });
  }
})();
