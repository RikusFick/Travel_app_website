/* Signed-in account settings on account.html. Auth itself lives in auth.js. */
import {
  updateProfile,
  verifyBeforeUpdateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  deleteUser
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

(function () {
  const panel = document.getElementById("accountPanel");
  if (!panel) return;

  const $ = function (id) { return document.getElementById(id); };

  function esc(text) {
    return String(text || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function currentUser() {
    return window.earwiseAuth && window.earwiseAuth.currentUser && window.earwiseAuth.currentUser();
  }

  function providersOf(user) {
    const list = (user && user.providerData) || [];
    return list.map(function (p) { return p && p.providerId; }).filter(Boolean);
  }

  function hasPassword(user) {
    return providersOf(user).indexOf("password") !== -1;
  }

  function federatedLabel(user) {
    const ids = providersOf(user);
    const names = [];
    if (ids.indexOf("google.com") !== -1) names.push("Google");
    if (ids.indexOf("apple.com") !== -1) names.push("Apple");
    if (!names.length) return "";
    if (names.length === 1) return "You sign in with " + names[0];
    return "You sign in with " + names.join(" and ");
  }

  function hasGoogle(user) {
    return providersOf(user).indexOf("google.com") !== -1;
  }

  function friendly(err) {
    const code = err && err.code;
    if (code === "auth/invalid-email") return "Enter a valid email address.";
    if (code === "auth/missing-password" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
      return "That password is wrong.";
    }
    if (code === "auth/weak-password") return "Use at least 8 characters.";
    if (code === "auth/requires-recent-login") return "Please confirm it's you and try again.";
    if (code === "auth/email-already-in-use") return "That email already has an account.";
    if (code === "auth/too-many-requests") return "Too many tries. Wait a moment and try again.";
    if (code === "auth/network-request-failed") return "Network problem. Check your connection and try again.";
    if (code === "auth/popup-blocked") return "Please allow pop-ups for getearwise.com and try again.";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "That confirmation was cancelled.";
    if (code === "auth/operation-not-allowed") return "That sign-in method is not enabled yet.";
    return (err && err.message) ? "Something went wrong. Try again." : "Something went wrong. Try again.";
  }

  async function reauth(password) {
    const user = currentUser();
    if (!user) throw new Error("signed-out");
    if (hasPassword(user)) {
      const pass = String(password || "");
      if (!pass) {
        const err = new Error("missing-password");
        err.code = "auth/missing-password";
        throw err;
      }
      const cred = EmailAuthProvider.credential(user.email, pass);
      await reauthenticateWithCredential(user, cred);
      return;
    }
    if (hasGoogle(user)) {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await reauthenticateWithPopup(user, provider);
      return;
    }
    const err = new Error("reauth");
    err.code = "auth/requires-recent-login";
    throw err;
  }

  function fillProfile(user) {
    const session = window.earwiseSession;
    const first = session && session.firstNameOf ? session.firstNameOf(user) : "";
    const last = session && session.lastNameOf ? session.lastNameOf(user) : "";
    const firstInput = $("profileFirst");
    const lastInput = $("profileLast");
    if (firstInput && document.activeElement !== firstInput) firstInput.value = first;
    if (lastInput && document.activeElement !== lastInput) lastInput.value = last;
    const emailEl = $("accountEmail");
    if (emailEl) emailEl.textContent = (user && user.email) || "";
  }

  function paintProviders(user) {
    const passwordForm = $("passwordForm");
    const federated = $("passwordFederated");
    const label = federatedLabel(user);
    const passwordUser = hasPassword(user);
    if (passwordForm) passwordForm.hidden = !passwordUser;
    if (federated) {
      federated.hidden = passwordUser || !label;
      federated.textContent = label ? (label + ".") : "";
    }
    const emailPasswordRow = $("emailPasswordRow");
    const emailNote = $("emailReauthNote");
    if (emailPasswordRow) emailPasswordRow.hidden = !passwordUser;
    if (emailNote) {
      emailNote.hidden = passwordUser || !label;
      emailNote.textContent = label
        ? "We'll ask you to confirm with " + (hasGoogle(user) ? "Google" : "your sign-in") + " before we send the email."
        : "";
    }
    const deletePasswordRow = $("deletePasswordRow");
    const deleteNote = $("deleteFederatedNote");
    if (deletePasswordRow) deletePasswordRow.hidden = !passwordUser;
    if (deleteNote) {
      deleteNote.hidden = passwordUser || !label;
      deleteNote.textContent = label
        ? "We'll ask you to confirm with " + (hasGoogle(user) ? "Google" : "your sign-in") + " first."
        : "";
    }
  }

  function fillPrefs() {
    const prefs = window.earwisePrefs && window.earwisePrefs.read ? window.earwisePrefs.read() : { playbackRate: 1, language: "en", newsOptIn: false };
    const speed = $("playSpeed");
    if (speed) speed.value = String(prefs.playbackRate);
    const lang = $("prefLang");
    if (lang && prefs.language) lang.value = prefs.language;
    const news = $("newsOptIn");
    if (news) news.checked = prefs.newsOptIn === true;
  }

  function formatAmount(row) {
    if (row == null || row.amount == null || row.amount === "") return "";
    const cents = Number(row.amount);
    if (!isFinite(cents)) return "";
    const currency = String(row.currency || "").toUpperCase();
    const major = cents / 100;
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
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Johannesburg"
    });
  }

  function receiptHref(row) {
    if (!row) return "";
    const url = String(row.receiptUrl || row.receipt_url || row.receipt || "").trim();
    if (/^https:\/\//i.test(url)) return url;
    return "";
  }

  function renderPurchases(guides) {
    const root = $("purchaseList");
    if (!root) return;
    const rows = Object.keys(guides || {}).map(function (id) {
      const row = guides[id] || {};
      return {
        id: row.guideId || id,
        title: row.title || id,
        purchasedAt: row.purchasedAt || row.createdAt || "",
        amount: row.amount,
        currency: row.currency,
        receipt: receiptHref(row)
      };
    }).sort(function (a, b) {
      return String(b.purchasedAt).localeCompare(String(a.purchasedAt));
    });
    if (!rows.length) {
      root.innerHTML = '<p class="muted">You have not bought any guides yet. <a href="guides/">Browse guides</a></p>';
      return;
    }
    root.innerHTML = '<ul class="purchase-list">' + rows.map(function (row) {
      const meta = [formatDate(row.purchasedAt), formatAmount(row)].filter(Boolean).join(" · ");
      const receipt = row.receipt
        ? ' <a class="purchase-receipt" href="' + esc(row.receipt) + '" target="_blank" rel="noopener">Receipt</a>'
        : "";
      return '<li><a class="purchase-item" href="/' + esc(row.id) + '/">' +
        '<img src="img/guides/' + esc(row.id) + '.jpg" alt="" width="96" height="64" onerror="this.remove()">' +
        '<span><strong>' + esc(row.title) + "</strong>" +
        (meta ? '<span class="fine">' + esc(meta) + "</span>" : "") +
        "</span></a>" + receipt + "</li>";
    }).join("") + "</ul>";
  }

  async function loadPurchases() {
    const root = $("purchaseList");
    const purchases = window.earwisePurchases;
    if (!purchases) {
      if (root) root.innerHTML = '<p class="muted">Purchases are not available right now.</p>';
      return;
    }
    try {
      if (purchases.hydrate) purchases.hydrate();
      if (purchases.list) renderPurchases(purchases.list());
      if (purchases.load) {
        const data = await purchases.load();
        renderPurchases((data && data.guides) || (purchases.list && purchases.list()) || {});
      }
    } catch (err) {
      if (root && !root.querySelector(".purchase-list")) {
        root.innerHTML = '<p class="muted">We could not load your purchases just now.</p>';
      }
    }
  }

  async function loadLanguages() {
    const select = $("prefLang");
    if (!select) return;
    const prefs = window.earwisePrefs && window.earwisePrefs.read ? window.earwisePrefs.read() : { language: "en" };
    let names = {};
    const withAudio = {};
    try {
      const res = await fetch("data/audio.json", { headers: { Accept: "application/json" } });
      const data = res.ok ? await res.json() : {};
      names = (data && data.languages) || {};
      const guides = (data && data.guides) || {};
      Object.keys(guides).forEach(function (id) {
        const langs = (guides[id] && guides[id].languages) || {};
        Object.keys(langs).forEach(function (code) {
          if (Array.isArray(langs[code]) && langs[code].length) withAudio[code] = true;
        });
      });
    } catch (err) {
      /* keep empty and fall back */
    }
    const codes = Object.keys(withAudio);
    if (!codes.length && names.en) codes.push("en");
    if (!codes.length) codes.push("en");
    const order = ["en", "es", "fr", "de", "it", "pt", "ru", "ja", "hi", "zh"];
    codes.sort(function (a, b) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    const keep = withAudio[prefs.language] ? prefs.language : (withAudio.en ? "en" : codes[0]);
    select.innerHTML = codes.map(function (code) {
      const label = names[code] || code;
      return '<option value="' + esc(code) + '"' + (code === keep ? " selected" : "") + ">" + esc(label) + "</option>";
    }).join("");
  }

  function setSignedInChrome(user) {
    const wrap = $("authWrap");
    const gate = $("authGate");
    if (new URLSearchParams(location.search).get("next")) return;
    if (user) {
      if (gate) gate.hidden = true;
      panel.hidden = false;
      if (wrap) wrap.classList.add("is-account");
      document.title = "Your account | Earwise";
      fillProfile(user);
      paintProviders(user);
    } else {
      panel.hidden = true;
      if (gate) gate.hidden = false;
      if (wrap) wrap.classList.remove("is-account");
      document.title = "Log in or sign up | Earwise";
    }
  }

  function wire() {
    if (panel.dataset.wired) return;
    panel.dataset.wired = "1";

    const profileForm = $("profileForm");
    if (profileForm) {
      profileForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const user = currentUser();
        const msg = $("profileMsg");
        if (!user) return;
        const first = (($("profileFirst") && $("profileFirst").value) || "").trim();
        const last = (($("profileLast") && $("profileLast").value) || "").trim();
        const displayName = [first, last].filter(Boolean).join(" ");
        if (msg) msg.textContent = "Saving…";
        updateProfile(user, { displayName: displayName }).then(function () {
          if (window.earwiseSession) {
            window.earwiseSession.writeHint(user);
            window.earwiseSession.paintHeader(user, { pending: false });
          }
          fillProfile(user);
          if (msg) msg.textContent = "Saved.";
        }).catch(function (err) {
          if (msg) msg.textContent = friendly(err);
        });
      });
    }

    const emailForm = $("emailForm");
    if (emailForm) {
      emailForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const user = currentUser();
        const msg = $("emailMsg");
        if (!user) return;
        const next = (($("newEmail") && $("newEmail").value) || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) {
          if (msg) msg.textContent = "Enter a valid email address.";
          return;
        }
        if (next.toLowerCase() === String(user.email || "").toLowerCase()) {
          if (msg) msg.textContent = "That's already your email.";
          return;
        }
        const password = ($("emailPassword") && $("emailPassword").value) || "";
        if (msg) msg.textContent = "Sending…";
        reauth(password).then(function () {
          return verifyBeforeUpdateEmail(user, next);
        }).then(function () {
          if (msg) msg.textContent = "Check your inbox at " + next + " and click the link to confirm the new address. Your email stays the same until you do.";
          if ($("emailPassword")) $("emailPassword").value = "";
        }).catch(function (err) {
          if (msg) msg.textContent = friendly(err);
        });
      });
    }

    const passwordForm = $("passwordForm");
    if (passwordForm) {
      passwordForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const user = currentUser();
        const msg = $("passwordMsg");
        if (!user) return;
        const current = ($("currentPassword") && $("currentPassword").value) || "";
        const next = ($("newPassword") && $("newPassword").value) || "";
        if (next.length < 8) {
          if (msg) msg.textContent = "Use at least 8 characters.";
          return;
        }
        if (msg) msg.textContent = "Saving…";
        reauth(current).then(function () {
          return updatePassword(user, next);
        }).then(function () {
          if (msg) msg.textContent = "Password updated.";
          if ($("currentPassword")) $("currentPassword").value = "";
          if ($("newPassword")) $("newPassword").value = "";
        }).catch(function (err) {
          if (msg) msg.textContent = friendly(err);
        });
      });
    }

    const prefsForm = $("prefsForm");
    if (prefsForm) {
      prefsForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const msg = $("prefsMsg");
        const rate = Number($("playSpeed") && $("playSpeed").value);
        const language = ($("prefLang") && $("prefLang").value) || "en";
        if (window.earwisePrefs) window.earwisePrefs.write({ playbackRate: rate, language: language });
        if (msg) msg.textContent = "Saved. The website player will use these next time you play a guide.";
      });
    }

    const news = $("newsOptIn");
    if (news) {
      news.addEventListener("change", function () {
        if (window.earwisePrefs) window.earwisePrefs.write({ newsOptIn: news.checked });
        const msg = $("newsMsg");
        if (msg) msg.textContent = news.checked ? "Saved. We'll only email you when this is ready." : "Saved. You won't be added to guide news.";
      });
    }

    const signOutBtn = $("signOutHere");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        if (window.earwiseAuth && window.earwiseAuth.signOut) window.earwiseAuth.signOut();
      });
    }

    const deleteBtn = $("deleteAccountBtn");
    const dialog = $("deleteDialog");
    const deleteForm = $("deleteForm");
    if (deleteBtn && dialog) {
      deleteBtn.addEventListener("click", function () {
        const msg = $("deleteMsg");
        if (msg) msg.textContent = "";
        if ($("deletePassword")) $("deletePassword").value = "";
        if (dialog.showModal) dialog.showModal();
        else dialog.setAttribute("open", "");
      });
    }
    if (deleteForm) {
      deleteForm.addEventListener("submit", function (event) {
        const submitter = event.submitter || document.activeElement;
        const value = submitter && submitter.value;
        if (value === "cancel") return;
        event.preventDefault();
        const user = currentUser();
        const msg = $("deleteMsg");
        if (!user) return;
        const password = ($("deletePassword") && $("deletePassword").value) || "";
        if (msg) msg.textContent = "Deleting…";
        const confirmBtn = $("deleteConfirmBtn");
        if (confirmBtn) confirmBtn.disabled = true;
        reauth(password).then(function () {
          return deleteUser(user);
        }).then(function () {
          if (window.earwiseSession) window.earwiseSession.clearHint();
          if (window.earwisePurchases && window.earwisePurchases.clear) window.earwisePurchases.clear();
          if (dialog.close) dialog.close();
          if (window.earwiseAuth && window.earwiseAuth.signOut) window.earwiseAuth.signOut();
        }).catch(function (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          if (msg) msg.textContent = friendly(err);
        });
      });
    }
  }

  function start() {
    wire();
    fillPrefs();
    loadLanguages().then(fillPrefs);
    const user = currentUser();
    if (user) {
      setSignedInChrome(user);
      loadPurchases();
    } else if (window.earwiseSession && window.earwiseSession.readHint && window.earwiseSession.readHint()) {
      loadPurchases();
    }
    if (window.earwiseAuth && window.earwiseAuth.onUser) {
      window.earwiseAuth.onUser(function (user) {
        setSignedInChrome(user);
        if (user) loadPurchases();
      });
    }
  }

  if (window.earwiseAuth) start();
  else window.addEventListener("earwise-auth-ready", start, { once: true });
})();
