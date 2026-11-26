import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const cfg = window.EARWISE_FIREBASE || {};
let auth = null;
let currentUser = null;
let authReady = false;
let signingIn = false;
let justAuthenticated = false;
let redirected = false;
const listeners = [];
let resolveReady = function () {};
const readyPromise = new Promise(function (resolve) { resolveReady = resolve; });

function firebaseConfigured() {
  const needed = ["apiKey", "authDomain", "projectId", "appId"];
  return needed.every(function (key) {
    const value = String(cfg[key] || "");
    return value && value.indexOf("YOUR_") !== 0;
  });
}

function esc(text) {
  return String(text || "").replace(/[&<>"']/g, function (ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
  });
}

function accountHref() {
  if (window.earwiseSession && window.earwiseSession.accountHref) {
    return window.earwiseSession.accountHref();
  }
  const slot = document.querySelector("#site-nav .auth-slot, .auth-slot");
  if (slot && slot.getAttribute("data-account-href")) return slot.getAttribute("data-account-href");
  const link = document.querySelector("#site-nav a[href$='account.html']") ||
    document.querySelector(".auth-slot a[href$='account.html']") ||
    document.querySelector("a[data-auth-link]");
  return link ? link.getAttribute("href") : "account.html";
}

function hrefBase(accountUrl) {
  return String(accountUrl || "account.html").replace(/account\.html(?:#.*)?$/, "");
}

function markReady() {
  if (authReady) return;
  authReady = true;
  resolveReady();
}

function nextDestination() {
  const next = new URLSearchParams(location.search).get("next");
  if (next && next.charAt(0) === "/" && next.indexOf("//") === -1 && next.indexOf("\\") === -1) {
    return next;
  }
  return "my-guides.html";
}

function firstNameOf(user) {
  if (window.earwiseSession && window.earwiseSession.firstNameOf) {
    return window.earwiseSession.firstNameOf(user);
  }
  const raw = String((user && user.displayName) || "").trim();
  if (!raw || raw.indexOf("@") !== -1) return "";
  return raw.split(/\s+/)[0] || "";
}

function guidesHello(user) {
  if (window.earwiseSession && window.earwiseSession.guidesHello) {
    return window.earwiseSession.guidesHello(user);
  }
  const name = firstNameOf(user);
  return name ? "Ready when you are, " + name + "." : "Ready when you are.";
}

function afterSignIn() {
  if (redirected) return;
  if (!document.getElementById("authForm")) return;
  if (!currentUser) return;
  const hasNext = !!(new URLSearchParams(location.search).get("next"));
  if (justAuthenticated || hasNext) {
    redirected = true;
    location.replace(nextDestination());
  }
}

function paintHeader(user, opts) {
  if (window.earwiseSession && window.earwiseSession.paintHeader) {
    window.earwiseSession.paintHeader(user, opts || { pending: false });
    return;
  }
  const nav = document.getElementById("site-nav");
  if (!nav) return;
  const accountUrl = accountHref();
  const base = hrefBase(accountUrl);
  let slot = nav.querySelector(".auth-slot");
  if (!slot) {
    const login = nav.querySelector("a[href$='account.html']");
    slot = document.createElement("span");
    slot.className = "auth-slot";
    if (login) login.replaceWith(slot);
    else nav.appendChild(slot);
  }
    if (!user) {
    slot.innerHTML =
      '<a class="acct-btn" href="' + esc(base + "account.html") + '" data-auth-link aria-label="Log in" title="Log in">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg><span class="acct-label">Log in</span></a>';
    return;
  }
  const email = user.email || "Signed in";
  const name = firstNameOf(user);
  const whoLabel = name || email;
  const initial = (String(name || email).trim().charAt(0) || "•").toUpperCase();
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
  const button = slot.querySelector("[data-auth-logout]");
  if (button) button.addEventListener("click", doSignOut);
  const toggle = slot.querySelector(".acct-btn");
  const menu = slot.querySelector(".acct-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (!menu.hidden && !slot.contains(e.target)) { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
    });
  }
}

function doSignOut() {
  if (window.earwiseSession) window.earwiseSession.clearHint();
  if (window.earwisePurchases && window.earwisePurchases.clear) window.earwisePurchases.clear();
  currentUser = null;
  paintHeader(null, { pending: false });
  showGuides(null);
  if (!auth) return;
  signOut(auth).catch(function (err) {
    const msg = document.getElementById("authMsg");
    if (msg) msg.textContent = friendly(err);
  });
}

function friendly(err) {
  const code = err && err.code;
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/missing-password") return "Enter your password.";
  if (code === "auth/weak-password") return "Use at least 8 characters.";
  if (code === "auth/email-already-in-use") return "That email already has an account. Log in instead.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Email or password is wrong.";
  }
  if (code === "auth/too-many-requests") return "Too many tries. Wait a moment and try again.";
  if (code === "auth/network-request-failed") return "Network problem. Check your connection and try again.";
  if (code === "auth/popup-blocked") return "Please allow pop-ups for getearwise.com and try again.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Google sign-in was cancelled.";
  if (code === "auth/account-exists-with-different-credential") {
    return "That email already has an Earwise account. Log in with email and password.";
  }
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled yet.";
  if (code === "auth/unauthorized-domain") return "This site is not on the Firebase authorized domain list.";
  return "Something went wrong. Try again.";
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function setSigningIn(on) {
  signingIn = on;
  const form = document.getElementById("authForm");
  if (form) {
    form.querySelectorAll("input, button").forEach(function (el) { el.disabled = on; });
  }
  const googleBtn = document.getElementById("googleSignIn");
  if (googleBtn) googleBtn.disabled = on;
}

function wireAccount() {

  const form = document.getElementById("authForm");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";
  const banner = document.getElementById("authBanner");
  const msg = document.getElementById("authMsg");
  let mode = location.hash === "#signup" ? "signup" : "login";

  function $(id) { return document.getElementById(id); }
  function setMode(next) {
    mode = next;
    const signup = next === "signup";
    $("tabLogin").setAttribute("aria-selected", signup ? "false" : "true");
    $("tabSignup").setAttribute("aria-selected", signup ? "true" : "false");
    $("authTitle").textContent = signup ? "Create your account" : "Welcome back";
    $("submitBtn").textContent = signup ? "Create account" : "Log in";
    $("pwHint").hidden = !signup;
    $("forgot").hidden = signup;
    $("password").autocomplete = signup ? "new-password" : "current-password";
    const nameRow = $("firstNameRow");
    if (nameRow) nameRow.hidden = !signup;
    if (msg) msg.textContent = "";
    if (signup && location.hash !== "#signup") history.replaceState(null, "", "#signup");
    if (!signup && location.hash === "#signup") history.replaceState(null, "", "account.html");
  }

  $("tabLogin").addEventListener("click", function () { setMode("login"); });
  $("tabSignup").addEventListener("click", function () { setMode("signup"); });
  setMode(mode);

  const eye = $("pwEye");
  if (eye) {
    const openEye = eye.innerHTML;
    const shutEye = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
    eye.addEventListener("click", function () {
      const show = $("password").type === "password";
      $("password").type = show ? "text" : "password";
      eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
      eye.setAttribute("aria-pressed", show ? "true" : "false");
      eye.innerHTML = show ? shutEye : openEye;
    });
  }

  const googleBtn = $("googleSignIn");

  if (!firebaseConfigured()) {
    if (banner) banner.hidden = false;
    form.querySelectorAll("input, button").forEach(function (el) { el.disabled = true; });
    if (googleBtn) googleBtn.disabled = true;
    const forgot = $("forgot");
    if (forgot) forgot.addEventListener("click", function (event) { event.preventDefault(); });
    return;
  }
  if (banner) banner.hidden = true;

  if (googleBtn && !googleBtn.dataset.wired) {
    googleBtn.dataset.wired = "1";
    googleBtn.addEventListener("click", function () {
      if (signingIn || !auth) return;
      justAuthenticated = true;
      setSigningIn(true);
      if (msg) msg.textContent = "Opening Google…";
      signInWithPopup(auth, googleProvider()).catch(function (err) {
        justAuthenticated = false;
        setSigningIn(false);
        if (msg) msg.textContent = friendly(err);
      });
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (signingIn || !auth) return;
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      msg.textContent = "Enter a valid email address.";
      return;
    }
    if (mode === "signup" && password.length < 8) {
      msg.textContent = "Use at least 8 characters.";
      return;
    }
    if (!password) {
      msg.textContent = "Enter your password.";
      return;
    }
    justAuthenticated = true;
    setSigningIn(true);
    msg.textContent = mode === "signup" ? "Creating your account…" : "Signing in…";
    const firstName = mode === "signup" ? (($("firstName") && $("firstName").value) || "").trim() : "";
    const task = mode === "signup"
      ? createUserWithEmailAndPassword(auth, email, password).then(function (cred) {
          if (firstName && cred && cred.user) {
            return updateProfile(cred.user, { displayName: firstName }).then(function () {
              if (window.earwiseSession) window.earwiseSession.writeHint(cred.user);
              paintHeader(cred.user, { pending: false });
              showGuides(cred.user);
              return cred;
            });
          }
          return cred;
        })
      : signInWithEmailAndPassword(auth, email, password);
    task.catch(function (err) {
      justAuthenticated = false;
      setSigningIn(false);
      msg.textContent = friendly(err);
    });
  });

  $("forgot").addEventListener("click", function (event) {
    event.preventDefault();
    if (signingIn) return;
    const email = $("email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      msg.textContent = "Enter your email address first.";
      return;
    }
    sendPasswordResetEmail(auth, email).then(function () {
      msg.textContent = "If an account exists, a reset link is on its way.";
    }).catch(function (err) {
      msg.textContent = friendly(err);
    });
  });
}

function showGuides(user) {
  const who = document.getElementById("who");
  if (!who) return;
  const banner = document.getElementById("authBanner");
  const out = document.getElementById("signOut");
  const list = document.getElementById("my-guide-list");
  if (out && !out.dataset.wired) {
    out.dataset.wired = "1";
    out.addEventListener("click", doSignOut);
  }
  if (!firebaseConfigured()) {
    if (banner) banner.hidden = false;
    who.textContent = "Sign-in isn’t available until Firebase is configured.";
    if (out) out.hidden = true;
    return;
  }
  if (banner) banner.hidden = true;
  if (!user) {
    if (!authReady) {
      const hint = window.earwiseSession && window.earwiseSession.readHint && window.earwiseSession.readHint();
      if (hint) {
        var helloHint = document.getElementById("guides-hello");
        if (helloHint) helloHint.textContent = guidesHello(hint);
        who.textContent = "";
        if (out) out.hidden = false;
        if (list) list.hidden = false;
        var stripHint = document.getElementById("next-strip");
        if (stripHint) stripHint.hidden = false;
        return;
      }
      who.textContent = "Checking your account…";
      if (out) out.hidden = true;
      if (list) list.hidden = true;
      return;
    }
    var hello = document.getElementById("guides-hello");
    var gate = document.getElementById("guides-gate");
    if (hello) hello.textContent = "Log in to see your guides.";
    who.textContent = "";
    if (gate) {
      gate.hidden = false;
      gate.innerHTML = '<a class="btn" href="account.html">Log in</a>';
    }
    if (out) out.hidden = true;
    if (list) list.hidden = true;
    var stripOut = document.getElementById("next-strip");
    if (stripOut) stripOut.hidden = true;
    return;
  }
  var helloIn = document.getElementById("guides-hello");
  var gateIn = document.getElementById("guides-gate");
  if (helloIn) helloIn.textContent = guidesHello(user);
  if (gateIn) gateIn.hidden = true;
  who.textContent = "";
  if (out) out.hidden = false;
  if (list) list.hidden = false;
  var stripIn = document.getElementById("next-strip");
  if (stripIn) stripIn.hidden = false;
}

function notify(user) {
  currentUser = user || null;
  if (window.earwiseSession) {
    if (currentUser) window.earwiseSession.writeHint(currentUser);
    else window.earwiseSession.clearHint();
  }
  markReady();
  paintHeader(currentUser, { pending: false });
  showGuides(currentUser);
  if (window.earwiseSession && window.earwiseSession.paintAccountShell) {
    window.earwiseSession.paintAccountShell();
  }
  listeners.forEach(function (fn) { fn(currentUser); });
  if (currentUser) afterSignIn();
}

wireAccount();

window.earwiseAuth = {
  configured: firebaseConfigured,
  currentUser: function () { return currentUser; },
  ready: function () { return readyPromise; },
  isReady: function () { return authReady; },
  onUser: function (fn) {
    listeners.push(fn);
    if (authReady) fn(currentUser);
    return function () {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
  idToken: async function () {
    await readyPromise;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  },
  signOut: doSignOut
};
window.dispatchEvent(new Event("earwise-auth-ready"));

if (!firebaseConfigured()) {
  notify(null);
} else {
  const app = initializeApp(cfg);
  auth = initializeAuth(app, {
    persistence: [browserLocalPersistence, indexedDBLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver
  });
  onAuthStateChanged(auth, notify);
}
