/* Optimistic, non-sensitive session hint + last /me cache.
   Paints the header and My guides before Firebase Auth is ready.
   Never stores tokens or other secrets. Cached ownership is UI-only. */
(function () {
  var HINT_KEY = "earwise_auth_hint";
  var ME_PREFIX = "earwise_me_";
  var docWired = false;

  function esc(text) {
    return String(text || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function readJson(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var val = JSON.parse(raw);
      return val && typeof val === "object" ? val : null;
    } catch (err) {
      return null;
    }
  }

  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (err) {
      return false;
    }
  }

  function readHint() {
    var hint = readJson(HINT_KEY);
    if (!hint || hint.signedIn !== true || !hint.uid) return null;
    return {
      signedIn: true,
      uid: String(hint.uid),
      email: String(hint.email || ""),
      displayName: String(hint.displayName || "")
    };
  }

  function writeHint(user) {
    if (!user || !user.uid) return;
    writeJson(HINT_KEY, {
      signedIn: true,
      uid: String(user.uid),
      email: String(user.email || ""),
      displayName: String(user.displayName || "")
    });
  }

  function firstNameOf(user) {
    var raw = String((user && user.displayName) || "").trim();
    if (!raw || raw.indexOf("@") !== -1) return "";
    var word = raw.split(/\s+/)[0].replace(/[,.;:!?]+$/g, "");
    return word || "";
  }

  function lastNameOf(user) {
    var raw = String((user && user.displayName) || "").trim();
    if (!raw) return "";
    var parts = raw.split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  }

  function guidesHello(user) {
    var name = firstNameOf(user);
    return name ? "Ready when you are, " + name + "." : "Ready when you are.";
  }

  var PREFS_KEY = "earwise_prefs";
  var SPEED_OPTS = [0.75, 1, 1.25, 1.5];

  function defaultPrefs() {
    return { playbackRate: 1, language: "en", newsOptIn: false };
  }

  function readPrefs() {
    var stored = readJson(PREFS_KEY) || {};
    var rate = Number(stored.playbackRate);
    if (SPEED_OPTS.indexOf(rate) === -1) rate = 1;
    var language = String(stored.language || "en").trim().toLowerCase();
    if (!/^[a-z]{2,3}$/.test(language)) language = "en";
    return {
      playbackRate: rate,
      language: language,
      newsOptIn: stored.newsOptIn === true
    };
  }

  function writePrefs(partial) {
    var next = readPrefs();
    if (partial && typeof partial === "object") {
      if (partial.playbackRate != null) {
        var rate = Number(partial.playbackRate);
        if (SPEED_OPTS.indexOf(rate) !== -1) next.playbackRate = rate;
      }
      if (partial.language != null) {
        var language = String(partial.language || "").trim().toLowerCase();
        if (/^[a-z]{2,3}$/.test(language)) next.language = language;
      }
      if (partial.newsOptIn != null) next.newsOptIn = partial.newsOptIn === true;
    }
    writeJson(PREFS_KEY, next);
    return next;
  }

  function clearHint() {
    try { localStorage.removeItem(HINT_KEY); } catch (err) { /* ignore */ }
  }

  function meKey(uid) {
    return ME_PREFIX + String(uid || "");
  }

  function readMe(uid) {
    if (!uid) return null;
    var stored = readJson(meKey(uid));
    if (!stored || typeof stored !== "object") return null;
    var guides = stored.guides && typeof stored.guides === "object" ? stored.guides : null;
    if (!guides) return null;
    return { guides: guides, updatedAt: stored.updatedAt || 0 };
  }

  function writeMe(uid, payload) {
    if (!uid || !payload) return;
    var guides = payload.guides && typeof payload.guides === "object" ? payload.guides : {};
    writeJson(meKey(uid), { guides: guides, updatedAt: Date.now() });
  }

  function accountHref() {
    var slot = document.querySelector("#site-nav .auth-slot, .auth-slot");
    if (slot && slot.getAttribute("data-account-href")) return slot.getAttribute("data-account-href");
    var link = document.querySelector("#site-nav a[href$='account.html']") ||
      document.querySelector(".auth-slot a[href$='account.html']") ||
      document.querySelector("a[data-auth-link]");
    if (link) return link.getAttribute("href");
    var path = (location.pathname || "/").replace(/\/+$/, "") || "/";
    var depth = path === "/" ? 0 : path.split("/").filter(Boolean).length;
    if (path.indexOf(".") >= 0 && !/\/$/.test(location.pathname)) depth -= 1;
    if (depth <= 0) return "account.html";
    if (location.pathname.charAt(0) === "/") return "/account.html";
    var prefix = "";
    for (var i = 0; i < depth; i++) prefix += "../";
    return prefix + "account.html";
  }

  function hrefBase(accountUrl) {
    return String(accountUrl || "account.html").replace(/account\.html(?:#.*)?$/, "");
  }

  function ensureSlot() {
    var nav = document.getElementById("site-nav");
    if (!nav) return null;
    var slot = nav.querySelector(".auth-slot");
    if (slot) return slot;
    var login = nav.querySelector("a[href$='account.html']");
    slot = document.createElement("span");
    slot.className = "auth-slot";
    if (login) {
      slot.setAttribute("data-account-href", login.getAttribute("href") || "account.html");
      login.replaceWith(slot);
    } else {
      slot.setAttribute("data-account-href", accountHref());
      nav.appendChild(slot);
    }
    return slot;
  }

  function paintPending(slot) {
    slot.innerHTML =
      '<span class="auth-pending" aria-label="Checking account">' +
      '<span class="auth-pending-icon" aria-hidden="true"></span></span>';
  }

  function personSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
  }

  function initialOf(user) {
    var name = firstNameOf(user);
    var ch = String(name || (user && user.email) || "").trim().charAt(0).toUpperCase();
    return /[A-Z0-9]/.test(ch) ? ch : "•";
  }

  function paintSignedOut(slot) {
    var accountUrl = slot.getAttribute("data-account-href") || accountHref();
    slot.innerHTML =
      '<a class="acct-btn" href="' + esc(accountUrl) + '" data-auth-link aria-label="Log in" title="Log in">' +
      personSvg() + '<span class="acct-label">Log in</span></a>';
  }

  function wireAcctMenu(slot) {
    var toggle = slot.querySelector(".acct-btn");
    var menu = slot.querySelector(".acct-menu");
    if (!toggle || !menu) return;
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    if (docWired) return;
    docWired = true;
    document.addEventListener("click", function (e) {
      var openSlot = document.querySelector("#site-nav .auth-slot, .auth-slot");
      var openMenu = openSlot && openSlot.querySelector(".acct-menu");
      var openBtn = openSlot && openSlot.querySelector(".acct-btn");
      if (openMenu && openBtn && !openMenu.hidden && !openSlot.contains(e.target)) {
        openMenu.hidden = true;
        openBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var openSlot = document.querySelector("#site-nav .auth-slot, .auth-slot");
      var openMenu = openSlot && openSlot.querySelector(".acct-menu");
      var openBtn = openSlot && openSlot.querySelector(".acct-btn");
      if (openMenu && openBtn && !openMenu.hidden) {
        openMenu.hidden = true;
        openBtn.setAttribute("aria-expanded", "false");
        openBtn.focus();
      }
    });
  }

  function paintSignedIn(slot, user) {
    var accountUrl = slot.getAttribute("data-account-href") || accountHref();
    var base = hrefBase(accountUrl);
    var email = (user && user.email) || "Signed in";
    var name = firstNameOf(user);
    var whoLabel = name || email;
    var initial = initialOf(user);
    slot.innerHTML =
      '<span class="acct">' +
      '<button type="button" class="acct-btn acct-btn-in" aria-haspopup="true" aria-expanded="false" aria-label="Account, ' + esc(whoLabel) + '" title="' + esc(whoLabel) + '">' +
      '<span class="acct-initial">' + esc(initial) + '</span><span class="acct-label">Account</span></button>' +
      '<span class="acct-menu" hidden>' +
      '<span class="acct-who">Signed in as<br><strong>' + esc(whoLabel) + "</strong></span>" +
      '<a href="' + esc(base + "my-guides.html") + '">My guides</a>' +
      '<a href="' + esc(base + "account.html") + '">Account</a>' +
      '<button type="button" class="auth-out" data-auth-logout>Sign out</button>' +
      "</span></span>";
    var button = slot.querySelector("[data-auth-logout]");
    if (button) {
      button.addEventListener("click", function () {
        if (window.earwiseAuth && window.earwiseAuth.signOut) window.earwiseAuth.signOut();
      });
    }
    wireAcctMenu(slot);
  }

  function paintHeader(user, opts) {
    var slot = ensureSlot();
    if (!slot) return;
    var pending = !!(opts && opts.pending);
    if (pending && !user) {
      paintPending(slot);
      return;
    }
    if (!user) {
      paintSignedOut(slot);
      return;
    }
    paintSignedIn(slot, user);
  }

  var catalogPromise = null;

  function countryName(code) {
    var names = {
      uae: "UAE",
      usa: "United States",
      uk: "United Kingdom"
    };
    var raw = String(code || "");
    if (names[raw]) return names[raw];
    return raw.replace(/-/g, " ").replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
  }

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch("/data/prices.json", { headers: { Accept: "application/json" } })
        .then(function (res) { return res.ok ? res.json() : { guides: [] }; })
        .then(function (data) {
          var map = {};
          ((data && data.guides) || []).forEach(function (row) {
            if (row && row.id) map[row.id] = row;
          });
          return map;
        })
        .catch(function () { return {}; });
    }
    return catalogPromise;
  }

  function renderGuideList(list, guides) {
    var ids = Object.keys(guides || {});
    var strip = document.getElementById("next-strip");
    if (strip) strip.hidden = false;
    if (!ids.length) {
      list.innerHTML =
        '<div class="empty-guides">' +
        "<p><strong>Nothing here yet.</strong></p>" +
        "<p>Your next story is one tap away.</p>" +
        '<a class="btn" href="guides/">Browse guides</a></div>';
      return;
    }
    loadCatalog().then(function (catalog) {
      list.innerHTML = ids.map(function (id) {
        var rec = guides[id] || {};
        var meta = catalog[id] || {};
        var title = rec.title || meta.title || id;
        var place = [countryName(meta.country), meta.place].filter(Boolean).join(" · ");
        var href = "/" + encodeURIComponent(id) + "/";
        return '<article class="own-card">' +
          '<a class="own-photo" href="' + href + '"><img src="/img/guides/' + encodeURIComponent(id) + '.jpg" alt="" onerror="this.remove()"></a>' +
          '<div class="own-copy"><h2>' + esc(title) + "</h2>" +
          (place ? '<p class="fine">' + esc(place) + "</p>" : "") +
          '<div class="own-actions"><a class="btn" href="' + href + '">Open guide</a>' +
          '<a class="btn btn-ghost" href="index.html#download">Listen in the app</a></div></div></article>';
      }).join("");
    });
  }

  function paintMyGuides() {
    var who = document.getElementById("who");
    var list = document.getElementById("my-guide-list");
    var out = document.getElementById("signOut");
    if (!who && !list) return;
    var hint = readHint();
    var hello = document.getElementById("guides-hello");
    var gate = document.getElementById("guides-gate");
    var strip = document.getElementById("next-strip");
    if (!hint) {
      if (hello) hello.textContent = "Log in to see your guides.";
      if (who) who.textContent = "";
      if (gate) {
        gate.hidden = false;
        gate.innerHTML = '<a class="btn" href="account.html">Log in</a>';
      }
      if (list) {
        list.hidden = true;
        list.innerHTML = "";
      }
      if (strip) strip.hidden = true;
      if (out) out.hidden = true;
      return;
    }
    if (hello) hello.textContent = guidesHello(hint);
    if (gate) gate.hidden = true;
    if (who) who.textContent = "";
    if (out) out.hidden = false;
    if (!list) return;
    var stored = readMe(hint.uid);
    var guides = stored && stored.guides ? stored.guides : null;
    list.hidden = false;
    if (guides && Object.keys(guides).length) {
      renderGuideList(list, guides);
    } else if (guides) {
      renderGuideList(list, {});
    } else {
      list.innerHTML = "<p class=\"muted\">Loading your guides…</p>";
    }
  }

  function apply() {
    var hint = readHint();
    if (hint) {
      paintHeader(hint, { pending: false });
    } else {
      paintHeader(null, { pending: true });
    }
    paintMyGuides();
    paintAccountShell();
  }

  function paintAccountShell() {
    var panel = document.getElementById("accountPanel");
    var gate = document.getElementById("authGate");
    if (!panel || !gate) return;
    if (new URLSearchParams(location.search).get("next")) return;
    var hint = readHint();
    if (!hint) {
      panel.hidden = true;
      gate.hidden = false;
      return;
    }
    gate.hidden = true;
    panel.hidden = false;
    var emailEl = document.getElementById("accountEmail");
    if (emailEl) emailEl.textContent = hint.email || "";
    var first = document.getElementById("profileFirst");
    var last = document.getElementById("profileLast");
    if (first && document.activeElement !== first && document.activeElement !== last) {
      first.value = firstNameOf(hint);
      if (last) last.value = lastNameOf(hint);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }

  window.earwiseSession = {
    readHint: readHint,
    writeHint: writeHint,
    clearHint: clearHint,
    readMe: readMe,
    writeMe: writeMe,
    accountHref: accountHref,
    paintHeader: paintHeader,
    paintMyGuides: paintMyGuides,
    paintAccountShell: paintAccountShell,
    firstNameOf: firstNameOf,
    lastNameOf: lastNameOf,
    guidesHello: guidesHello,
    renderGuideList: renderGuideList,
    apply: apply
  };

  window.earwisePrefs = {
    read: readPrefs,
    write: writePrefs,
    speeds: SPEED_OPTS.slice()
  };
})();
