import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const cfg = window.EARWISE_FIREBASE || {};
let auth = null;
let currentUser = null;
const listeners = [];

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
  const link = document.querySelector("#site-nav a[href$='account.html']") ||
    document.querySelector(".auth-slot a[href$='account.html']") ||
    document.querySelector("a[data-auth-link]");
  return link ? link.getAttribute("href") : "account.html";
}

function hrefBase(accountUrl) {
  return String(accountUrl || "account.html").replace(/account\.html(?:#.*)?$/, "");
}

function paintHeader(user) {
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
      '<a href="' + esc(base + "account.html") + '" data-auth-link>Log in</a>' +
      '<a href="' + esc(base + "account.html#signup") + '">Create account</a>';
    return;
  }
  const email = user.email || "Signed in";
  slot.innerHTML =
    '<a href="' + esc(base + "my-guides.html") + '" class="auth-email" title="' + esc(email) + '">' + esc(email) + "</a>" +
    '<button type="button" class="auth-out" data-auth-logout>Sign out</button>';
  const button = slot.querySelector("[data-auth-logout]");
  if (button) button.addEventListener("click", doSignOut);
}

function doSignOut() {
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
  return "Something went wrong. Try again.";
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

  if (!firebaseConfigured()) {
    if (banner) banner.hidden = false;
    form.querySelectorAll("input, button").forEach(function (el) { el.disabled = true; });
    const forgot = $("forgot");
    if (forgot) forgot.addEventListener("click", function (event) { event.preventDefault(); });
    return;
  }
  if (banner) banner.hidden = true;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
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
    msg.textContent = mode === "signup" ? "Creating your account…" : "Signing in…";
    const task = mode === "signup"
      ? createUserWithEmailAndPassword(auth, email, password)
      : signInWithEmailAndPassword(auth, email, password);
    task.then(function () {
      const next = new URLSearchParams(location.search).get("next");
      if (next && next.charAt(0) === "/" && next.indexOf("//") === -1) {
        location.href = next;
      } else {
        location.href = "my-guides.html";
      }
    }).catch(function (err) {
      msg.textContent = friendly(err);
    });
  });

  $("forgot").addEventListener("click", function (event) {
    event.preventDefault();
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
    location.replace("account.html");
    return;
  }
  who.textContent = "Signed in as " + user.email;
  if (out) out.hidden = false;
}

function notify(user) {
  currentUser = user || null;
  paintHeader(currentUser);
  if (document.getElementById("authForm") && currentUser) {
    const next = new URLSearchParams(location.search).get("next");
    if (next && next.charAt(0) === "/" && next.indexOf("//") === -1) {
      location.href = next;
      return;
    }
    location.replace("my-guides.html");
    return;
  }
  showGuides(currentUser);
  listeners.forEach(function (fn) { fn(currentUser); });
}

wireAccount();

window.earwiseAuth = {
  configured: firebaseConfigured,
  currentUser: function () { return currentUser; },
  onUser: function (fn) {
    listeners.push(fn);
    fn(currentUser);
    return function () {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
  idToken: async function () {
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
  auth = getAuth(app);
  onAuthStateChanged(auth, notify);
}
