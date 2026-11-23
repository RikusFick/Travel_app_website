/* Load read-along text: free guides for everyone; paid guides only after purchase.
   Paid scripts come from the purchase Worker (GET /script) so they are not public static files.
   The free sample stop's baked-in read-along is removed from paid pages; audio still plays. */
(function () {
  var loadedFor = "";

  function esc(text) {
    return String(text || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function pageGuide() {
    var dataEl = document.getElementById("earwise-audio");
    if (!dataEl) return null;
    try {
      var data = JSON.parse(dataEl.textContent);
      if (data && data.id) return data;
    } catch (err) { /* ignore */ }
    return null;
  }

  function isFreeGuide(info) {
    if (info && info.mode === "full") return true;
    var note = document.getElementById("buy-note");
    if (note && /this guide is free/i.test(note.textContent)) return true;
    var price = document.querySelector(".hero-copy .price, p.price, .price");
    if (price && /free/i.test(price.textContent)) return true;
    return false;
  }

  function workerBase() {
    return String((window.EARWISE_PAYSTACK || {}).verifyUrl || "").replace(/\/+$/, "").replace(/\/(verify|quote|script)$/i, "");
  }

  function paragraphsToHtml(paragraphs) {
    return (paragraphs || []).map(function (p) {
      return "<p>" + esc(p) + "</p>";
    }).join("");
  }

  function clearReadAlong() {
    document.querySelectorAll(".read-along").forEach(function (el) { el.remove(); });
  }

  function attachReadAlong(stopNode, paragraphs, replace) {
    if (!stopNode || !paragraphs || !paragraphs.length) return;
    var existing = stopNode.querySelector(".read-along");
    if (existing && replace) existing.remove();
    else if (existing) return;
    var details = document.createElement("details");
    details.className = "read-along";
    details.innerHTML = "<summary>Read along</summary><div class=\"transcript\">" + paragraphsToHtml(paragraphs) + "</div>";
    var audio = stopNode.querySelector(".stop-audio");
    if (audio) audio.insertAdjacentElement("afterend", details);
    else stopNode.appendChild(details);
  }

  function applyStops(stops, replace) {
    (stops || []).forEach(function (stop) {
      var number = Number(stop.number || stop.stop);
      if (!number) return;
      var li = null;
      document.querySelectorAll(".stops li").forEach(function (item) {
        var num = item.querySelector(".num");
        if (num && Number(num.textContent) === number) li = item;
      });
      if (!li) return;
      attachReadAlong(li, stop.paragraphs || stop.script || [], replace);
    });
  }

  async function fetchScript(guideId, lang) {
    var base = workerBase();
    if (!base || base.indexOf("YOUR_") >= 0) return null;
    var headers = { Accept: "application/json" };
    var auth = window.earwiseAuth;
    if (auth && auth.ready) await auth.ready();
    var token = auth && auth.idToken ? await auth.idToken() : null;
    if (token) headers.Authorization = "Bearer " + token;
    var url = base + "/script?guide=" + encodeURIComponent(guideId) + "&lang=" + encodeURIComponent(lang || "en");
    var res = await fetch(url, { headers: headers });
    if (!res.ok) return null;
    var data = await res.json().catch(function () { return null; });
    if (!data || !data.ok) return null;
    return data;
  }

  window.earwiseLoadPurchasedScript = function (guideId, lang) {
    return loadScript(guideId, lang, true);
  };

  async function loadScript(guideId, lang, force) {
    var info = pageGuide();
    var id = guideId || (info && info.id);
    if (!id) return null;
    var code = lang || (document.getElementById("audio-lang-select") || {}).value || "en";
    var key = id + ":" + code;
    if (!force && loadedFor === key) return null;
    var free = isFreeGuide(info);
    var owned = window.earwisePurchases && window.earwisePurchases.owns(id);
    if (!free && !owned) {
      clearReadAlong();
      loadedFor = "";
      return null;
    }
    try {
      if (window.earwisePurchases && window.earwisePurchases.load) {
        await window.earwisePurchases.load();
        owned = window.earwisePurchases.owns(id);
        if (!free && !owned) {
          clearReadAlong();
          loadedFor = "";
          return null;
        }
      }
      var data = await fetchScript(id, code);
      if (!data) return null;
      applyStops(data.stops, true);
      loadedFor = key;
      return data;
    } catch (err) {
      return null;
    }
  }

  function start() {
    var info = pageGuide();
    if (!info) return;
    var select = document.getElementById("audio-lang-select");
    if (select && !select.dataset.scriptWired) {
      select.dataset.scriptWired = "1";
      select.addEventListener("change", function () {
        loadScript(info.id, select.value, true);
      });
    }
    window.addEventListener("earwise-audio-lang", function (event) {
      var lang = event && event.detail && event.detail.lang;
      loadScript(info.id, lang || (select && select.value) || "en", true);
    });
    var run = function () { loadScript(info.id, (select && select.value) || "en", false); };
    if (window.earwiseAuth && window.earwiseAuth.ready) {
      window.earwiseAuth.ready().then(run);
    } else if (window.earwiseAuth) {
      run();
    } else {
      window.addEventListener("earwise-auth-ready", function () {
        if (window.earwiseAuth && window.earwiseAuth.ready) window.earwiseAuth.ready().then(run);
        else run();
      }, { once: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
