#!/usr/bin/env python3
"""Headless Chrome tests for optimistic auth hint + /me cache. Mocked Firebase and /me."""
from __future__ import annotations

import json
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

ROOT = Path("/workspace/audioguide/website-cover-replacements-repo")
PORT = 0
ORIGIN = f"http://127.0.0.1:{PORT}"
CHROME = "/usr/bin/google-chrome"
AUTH_DELAY_MS = 2500
ME_DELAY_MS = 1000
UID = "uid-test-1"
EMAIL = "tester@example.com"

MOCK_APP = """
export function initializeApp(cfg) { return { cfg }; }
"""

MOCK_AUTH = """
export const browserLocalPersistence = {};
export const indexedDBLocalPersistence = {};
export const browserPopupRedirectResolver = {};
export class GoogleAuthProvider {
  setCustomParameters() {}
}
export function initializeAuth(app) { return { app }; }
export function signInWithPopup() { return Promise.reject(new Error("not in test")); }
export function createUserWithEmailAndPassword() { return Promise.reject(new Error("not in test")); }
export function signInWithEmailAndPassword() { return Promise.reject(new Error("not in test")); }
export function sendPasswordResetEmail() { return Promise.resolve(); }
let notify = null;
export function onAuthStateChanged(auth, cb) {
  notify = cb;
  window.__AUTH_NOTIFY = function (user) { notify(user); };
  const delay = Number(window.__AUTH_DELAY_MS || 0);
  const fire = function () { cb(window.__MOCK_USER || null); };
  if (delay > 0) setTimeout(fire, delay);
  else fire();
  return function () {};
}
export function signOut() {
  window.__MOCK_USER = null;
  if (notify) notify(null);
  return Promise.resolve();
}
"""

CACHED_GUIDES = {
    "colosseum": {"guideId": "colosseum", "title": "Colosseum"},
}
FRESH_GUIDES = {
    "colosseum": {"guideId": "colosseum", "title": "Colosseum"},
    "pantheon": {"guideId": "pantheon", "title": "Pantheon"},
}

results = []


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        pass


def start_server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def install_routes(page, me_guides=None, me_delay_ms=ME_DELAY_MS):
    if me_guides is None:
        me_guides = FRESH_GUIDES

    def fulfill_js(route, body):
        route.fulfill(status=200, content_type="text/javascript; charset=utf-8", body=body)

    page.route("https://www.gstatic.com/firebasejs/*/firebase-app.js", lambda r: fulfill_js(r, MOCK_APP))
    page.route("https://www.gstatic.com/firebasejs/*/firebase-auth.js", lambda r: fulfill_js(r, MOCK_AUTH))
    page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, body=""))
    page.route("https://fonts.gstatic.com/**", lambda r: r.fulfill(status=200, body=""))

    def handle_me(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"ok": True, "guides": me_guides}),
        )

    page.route("https://earwise-purchase.earwise.workers.dev/me", handle_me)
    page.route("https://earwise-purchase.earwise.workers.dev/script**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"ok": True, "stops": []}),
    ))


def seed(page, *, signed_in=True, user=True, hint=True, me=True, delay=AUTH_DELAY_MS):
    payload = {
        "delay": delay,
        "signedIn": signed_in,
        "user": user,
        "hint": hint,
        "me": me,
        "uid": UID,
        "email": EMAIL,
        "guides": CACHED_GUIDES,
    }
    page.add_init_script(
        """
        (function (cfg) {
          window.__AUTH_DELAY_MS = cfg.delay;
          if (cfg.user && cfg.signedIn) {
            window.__MOCK_USER = {
              uid: cfg.uid,
              email: cfg.email,
              getIdToken: function () { return Promise.resolve("fake-token"); }
            };
          } else {
            window.__MOCK_USER = null;
          }
          try {
            if (cfg.hint && cfg.signedIn) {
              localStorage.setItem("earwise_auth_hint", JSON.stringify({
                signedIn: true, uid: cfg.uid, email: cfg.email
              }));
            } else {
              localStorage.removeItem("earwise_auth_hint");
            }
            if (cfg.me && cfg.signedIn) {
              localStorage.setItem("earwise_me_" + cfg.uid, JSON.stringify({
                guides: cfg.guides, updatedAt: Date.now()
              }));
            } else {
              localStorage.removeItem("earwise_me_" + cfg.uid);
            }
          } catch (err) {}
        })(""" + json.dumps(payload) + ");"
    )


def visible_text(page, sel):
    loc = page.locator(sel).first
    if loc.count() == 0:
        return ""
    if not loc.is_visible():
        return ""
    return loc.inner_text()


def header_is_account(page):
    return page.locator("#site-nav .acct-btn").count() > 0 and page.locator("#site-nav .acct-btn").first.is_visible()


def header_is_login(page):
    login = page.locator("#site-nav a[data-auth-link], #site-nav a:text('Log in')")
    # ignore noscript
    for i in range(login.count()):
        el = login.nth(i)
        if el.evaluate("e => e.closest('noscript')") :
            continue
        if el.is_visible() and "Log in" in (el.inner_text() or ""):
            return True
    return False


def header_is_pending(page):
    loc = page.locator("#site-nav .auth-pending")
    return loc.count() > 0 and loc.first.is_visible()


def auth_ready(page):
    return page.evaluate("() => !!(window.earwiseAuth && window.earwiseAuth.isReady && window.earwiseAuth.isReady())")


def redact(text):
    return (text or "").replace(EMAIL, "[redacted-email]")

def record(name, ok, detail=""):
    detail = redact(str(detail)) if detail else ""
    results.append((name, ok, detail))
    status = "PASS" if ok else "FAIL"
    print(f"{status}  {name}" + (f" — {detail}" if detail else ""))


def test_hint_header_and_guides_before_ready(page):
    install_routes(page)
    seed(page, signed_in=True, hint=True, me=True)
    page.goto(ORIGIN + "/my-guides.html", wait_until="domcontentloaded")
    page.wait_for_selector("#site-nav .acct-btn", timeout=2000)
    ready = auth_ready(page)
    login = header_is_login(page)
    who = visible_text(page, "#who")
    list_text = visible_text(page, "#my-guide-list")
    hidden_list = page.locator("#my-guide-list").get_attribute("hidden")
    ok = (
        header_is_account(page)
        and not login
        and not ready
        and "Colosseum" in list_text
        and "Sign in to see your guides" not in who
        and "You are not signed in" not in who
        and "No guides yet" not in list_text
        and hidden_list is None
    )
    record(
        "hint paints signed-in header + cached guides before auth ready",
        ok,
        f"ready={ready} login={login} account={header_is_account(page)} who={who!r} list={list_text!r}",
    )
    # After delayed /me, a newly owned guide should appear
    page.wait_for_function("() => window.earwiseAuth && window.earwiseAuth.isReady && window.earwiseAuth.isReady()", timeout=AUTH_DELAY_MS + 2000)
    page.wait_for_function("() => (document.getElementById('my-guide-list')||{}).innerText && document.getElementById('my-guide-list').innerText.indexOf('Pantheon') >= 0", timeout=4000)
    list_text = visible_text(page, "#my-guide-list")
    record("My guides refreshes from /me in the background", "Pantheon" in list_text and "Colosseum" in list_text, "list includes cached and refreshed titles")


def test_no_hint_neutral_loading(page):
    install_routes(page, me_guides={})
    seed(page, signed_in=False, user=False, hint=False, me=False)
    page.goto(ORIGIN + "/my-guides.html", wait_until="domcontentloaded")
    page.wait_for_selector("#site-nav .auth-slot", timeout=2000)
    ready = auth_ready(page)
    who = visible_text(page, "#who")
    list_text = visible_text(page, "#my-guide-list") or ""
    ok = (
        not ready
        and not header_is_login(page)
        and header_is_pending(page)
        and "Checking your account" in who
        and "You are not signed in" not in who
        and "Sign in to see your guides" not in who
        and "No guides yet" not in list_text
    )
    record(
        "no hint shows neutral loading, not signed-out copy",
        ok,
        f"ready={ready} pending={header_is_pending(page)} login={header_is_login(page)} who={who!r} list={list_text!r}",
    )
    page.wait_for_function("() => window.earwiseAuth && window.earwiseAuth.isReady && window.earwiseAuth.isReady()", timeout=AUTH_DELAY_MS + 2000)
    page.wait_for_timeout(200)
    who = visible_text(page, "#who")
    record(
        "after ready with no session, header is Log in and signed-out copy appears",
        header_is_login(page) and (not header_is_account(page)) and "not signed in" in who.lower(),
        f"login={header_is_login(page)} account={header_is_account(page)} who={who!r}",
    )


def test_guide_page_cached_ownership(page):
    install_routes(page)
    seed(page, signed_in=True, hint=True, me=True)
    page.goto(ORIGIN + "/colosseum/", wait_until="domcontentloaded")
    page.wait_for_selector("#site-nav .acct-btn, .buy-block .is-owned, .buy-block .btn", timeout=2000)
    # Wait briefly for checkout.js (defer) to apply cache, but not for auth delay
    page.wait_for_function(
        "() => document.querySelector('.buy-block .is-owned, .buy-block .btn') && document.querySelector('.buy-block .btn') && document.querySelector('.buy-block .btn').textContent.indexOf('You own this guide') >= 0",
        timeout=1500,
    )
    ready = auth_ready(page)
    btn = visible_text(page, ".buy-block .btn")
    ok = header_is_account(page) and not header_is_login(page) and not ready and "You own this guide" in btn
    record(
        "guide page uses cached ownership for header + Buy state before auth ready",
        ok,
        f"ready={ready} login={header_is_login(page)} btn={btn!r}",
    )


def test_stale_hint_reconciles_to_signed_out(page):
    install_routes(page, me_guides={})
    seed(page, signed_in=True, user=False, hint=True, me=True)  # hint present, auth will resolve signed out
    page.goto(ORIGIN + "/my-guides.html", wait_until="domcontentloaded")
    page.wait_for_selector("#site-nav .acct-btn", timeout=2000)
    record("stale hint paints signed-in first", header_is_account(page) and not auth_ready(page), f"ready={auth_ready(page)}")
    page.wait_for_function("() => window.earwiseAuth && window.earwiseAuth.isReady && window.earwiseAuth.isReady()", timeout=AUTH_DELAY_MS + 2000)
    page.wait_for_timeout(200)
    hint = page.evaluate("() => localStorage.getItem('earwise_auth_hint')")
    who = visible_text(page, "#who")
    record(
        "ready() signed-out clears hint and repaints Log in",
        header_is_login(page) and not header_is_account(page) and hint is None and "not signed in" in who.lower(),
        f"login={header_is_login(page)} hint={hint!r} who={who!r}",
    )


def test_sign_out_clears_hint(page):
    install_routes(page)
    seed(page, signed_in=True, hint=True, me=True, delay=200)
    page.goto(ORIGIN + "/my-guides.html", wait_until="domcontentloaded")
    page.wait_for_function("() => window.earwiseAuth && window.earwiseAuth.isReady && window.earwiseAuth.isReady()", timeout=2000)
    page.locator("#site-nav .acct-btn").click()
    page.locator("[data-auth-logout]").click()
    page.wait_for_timeout(200)
    hint = page.evaluate("() => localStorage.getItem('earwise_auth_hint')")
    record(
        "sign-out clears hint and shows Log in",
        header_is_login(page) and hint is None and not header_is_account(page),
        f"login={header_is_login(page)} hint={hint!r}",
    )


def test_preconnect_tags(page):
    page.goto(ORIGIN + "/my-guides.html", wait_until="domcontentloaded")
    hrefs = page.evaluate("""() => Array.from(document.querySelectorAll('link[rel=preconnect]')).map(l => l.href)""")
    need = [
        "https://www.gstatic.com/",
        "https://earwise-app.firebaseapp.com/",
        "https://earwise-purchase.earwise.workers.dev/",
    ]
    missing = [u for u in need if u not in hrefs]
    record("preconnect tags present for Worker and Firebase/gstatic", not missing, f"hrefs={hrefs} missing={missing}")


def main():
    httpd = start_server()
    global ORIGIN, PORT
    PORT = httpd.server_address[1]
    ORIGIN = f"http://127.0.0.1:{PORT}"
    print(f"Serving {ROOT} at {ORIGIN}")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROME, headless=True, args=["--disable-gpu"])
            tests = [
                test_hint_header_and_guides_before_ready,
                test_no_hint_neutral_loading,
                test_guide_page_cached_ownership,
                test_stale_hint_reconciles_to_signed_out,
                test_sign_out_clears_hint,
                test_preconnect_tags,
            ]
            for fn in tests:
                context = browser.new_context()
                page = context.new_page()
                try:
                    fn(page)
                except Exception as exc:
                    record(fn.__name__, False, type(exc).__name__ + ": " + str(exc).split(EMAIL)[0])
                finally:
                    try:
                        page.unroute_all(behavior="ignoreErrors")
                    except Exception:
                        pass
                    context.close()
            browser.close()
    finally:
        httpd.shutdown()

    failed = [r for r in results if not r[1]]
    print("")
    print(f"{len(results) - len(failed)} passed, {len(failed)} failed, {len(results)} total")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
