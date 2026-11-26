/* Paint a printable Earwise receipt from Worker GET /me data already on the account. */
(function () {
  var sheet = document.getElementById("receiptSheet");
  var statusEl = document.getElementById("receiptStatus");
  var printBtn = document.getElementById("printReceipt");
  if (!sheet) return;

  function esc(text) {
    return String(text || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function guideId() {
    return String(new URLSearchParams(location.search).get("guide") || "").trim();
  }

  function loginHref() {
    var next = "/receipt.html";
    var id = guideId();
    if (id) next += "?guide=" + encodeURIComponent(id);
    return "account.html?next=" + encodeURIComponent(next);
  }

  function formatAmount(row) {
    if (row == null || row.amount == null || row.amount === "") return "";
    var cents = Number(row.amount);
    if (!isFinite(cents)) return "";
    var currency = String(row.currency || "").toUpperCase();
    var major = cents / 100;
    try {
      return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: currency || "ZAR"
      }).format(major);
    } catch (err) {
      return (currency ? currency + " " : "") + major.toFixed(2);
    }
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Johannesburg"
    });
  }

  function setStatus(html) {
    if (!statusEl) return;
    statusEl.hidden = !html;
    statusEl.innerHTML = html || "";
  }

  function findPurchase(guides, id) {
    if (!guides || !id) return null;
    if (guides[id]) return guides[id];
    var keys = Object.keys(guides);
    for (var i = 0; i < keys.length; i++) {
      var row = guides[keys[i]] || {};
      if (String(row.guideId || keys[i]) === id) return row;
    }
    return null;
  }

  function paint(user, row) {
    var id = guideId();
    var title = (row && (row.title || row.guideId)) || id;
    var date = formatDate(row && (row.purchasedAt || row.createdAt));
    var amount = formatAmount(row);
    var reference = String((row && row.reference) || "").trim();
    var buyer = (user && user.email) || "";

    document.getElementById("receiptGuide").textContent = title || "Audio guide";
    document.getElementById("receiptAmount").textContent = amount || "Amount was not recorded for this purchase.";
    document.getElementById("receiptDate").textContent = date || "—";
    document.getElementById("receiptBuyer").textContent = buyer || "—";
    document.getElementById("receiptDateRow").hidden = !date;

    var refRow = document.getElementById("receiptRefRow");
    var refEl = document.getElementById("receiptRef");
    var note = document.getElementById("receiptPaystackNote");
    if (reference) {
      if (refEl) refEl.textContent = reference;
      if (refRow) refRow.hidden = false;
      if (note) note.hidden = false;
    } else {
      if (refRow) refRow.hidden = true;
      if (note) note.hidden = true;
    }

    document.title = "Receipt" + (title ? " · " + title : "") + " | Earwise";
    sheet.hidden = false;
    if (printBtn) printBtn.hidden = false;
    setStatus("");
  }

  function showSignIn() {
    sheet.hidden = true;
    if (printBtn) printBtn.hidden = true;
    setStatus(
      "<p>Log in to see this receipt.</p>" +
      '<p><a class="btn" href="' + esc(loginHref()) + '">Log in</a></p>'
    );
  }

  function showMissing() {
    sheet.hidden = true;
    if (printBtn) printBtn.hidden = true;
    if (!guideId()) {
      setStatus('<p class="muted">Choose a purchase from <a href="account.html">your account</a> to see its receipt.</p>');
      return;
    }
    setStatus('<p class="muted">We couldn\'t find that purchase on this account. <a href="account.html">Back to account</a></p>');
  }

  async function loadForUser(user) {
    if (!user) {
      showSignIn();
      return;
    }
    if (!guideId()) {
      showMissing();
      return;
    }
    var purchases = window.earwisePurchases;
    var guides = {};
    try {
      if (purchases && purchases.hydrate) purchases.hydrate();
      if (purchases && purchases.list) guides = purchases.list() || {};
      if (purchases && purchases.load) {
        var data = await purchases.load();
        guides = (data && data.guides) || (purchases.list && purchases.list()) || guides;
      }
    } catch (err) {
      setStatus('<p class="muted">We could not load this receipt just now. <a href="account.html">Back to account</a></p>');
      return;
    }
    var row = findPurchase(guides, guideId());
    if (!row) {
      showMissing();
      return;
    }
    paint(user, row);
  }

  function start() {
    if (printBtn && !printBtn.dataset.wired) {
      printBtn.dataset.wired = "1";
      printBtn.addEventListener("click", function () { window.print(); });
    }
    var auth = window.earwiseAuth;
    if (auth && auth.onUser) {
      auth.onUser(function (user) { loadForUser(user); });
      return;
    }
    if (auth && auth.currentUser) loadForUser(auth.currentUser());
    else showSignIn();
  }

  if (window.earwiseAuth) start();
  else window.addEventListener("earwise-auth-ready", start, { once: true });
})();
