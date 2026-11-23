/* Earwise purchase Worker: verify Paystack (test or live), save entitlements
   against a Firebase Auth user, and tell the website/app what that account owns.
   Secrets stay in Worker env — never in the static site. */
import prices from "./prices.json";
import currencyRules from "./currency.json";

const SITE_ORIGINS = [
  "https://getearwise.com",
  "https://www.getearwise.com",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = SITE_ORIGINS.includes(origin) ? origin : SITE_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(request, body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request) }
  });
}

function guideCatalog() {
  const rows = (prices && prices.guides) || [];
  const map = new Map();
  rows.forEach(function (row) { map.set(row.id, row); });
  return map;
}

const FX_KEY = "fx:EURZAR";
const FX_TTL = 86400; // ~24h
const QUOTE_TTL = 1800; // 30 minutes
const FALLBACK_RATE = Number((currencyRules && currencyRules.fallbackRate) || 19.25);
const CHARGE_CURRENCY = "ZAR";

function isSaneRate(rate) {
  return Number.isFinite(rate) && rate >= 10 && rate <= 40;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error("rate fetch failed");
  return await res.json();
}

async function fetchDailyRate() {
  try {
    const data = await fetchJson("https://api.frankfurter.dev/v1/latest?from=EUR&to=ZAR");
    const rate = Number(data && data.rates && data.rates.ZAR);
    if (isSaneRate(rate)) {
      return { rate: rate, date: data.date || "", source: "frankfurter.app" };
    }
  } catch (err) { /* try fallback */ }
  try {
    const data = await fetchJson("https://open.er-api.com/v6/latest/EUR");
    const rate = Number(data && data.rates && data.rates.ZAR);
    if (isSaneRate(rate) && (!data.result || data.result === "success")) {
      return { rate: rate, date: data.time_last_update_utc || data.date || "", source: "open.er-api.com" };
    }
  } catch (err) { /* use cache or constant */ }
  return null;
}

async function getDailyRate(env) {
  const raw = await env.ENTITLEMENTS.get(FX_KEY);
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      if (isSaneRate(Number(cached.rate))) {
        return { rate: Number(cached.rate), date: cached.date || "", source: cached.source || "cache", cached: true };
      }
    } catch (err) { /* refetch */ }
  }
  const fresh = await fetchDailyRate();
  if (fresh) {
    await env.ENTITLEMENTS.put(FX_KEY, JSON.stringify({
      rate: fresh.rate,
      date: fresh.date,
      source: fresh.source,
      fetchedAt: new Date().toISOString()
    }), { expirationTtl: FX_TTL });
    return fresh;
  }
  return { rate: FALLBACK_RATE, date: "", source: "fallback", fallback: true };
}

function zarCents(eurPrice, rate) {
  const eur = Math.round(Number(eurPrice) * 100) / 100;
  return Math.round(eur * Number(rate) * 100);
}

async function saveQuote(env, reference, quote) {
  await env.ENTITLEMENTS.put("quote:" + reference, JSON.stringify(quote), { expirationTtl: QUOTE_TTL });
}

async function loadQuote(env, reference) {
  const raw = await env.ENTITLEMENTS.get("quote:" + reference);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function lookupFirebaseUser(idToken, env) {
  const key = env.FIREBASE_WEB_API_KEY;
  if (!key || !idToken) return null;
  const res = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: idToken })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const user = data && data.users && data.users[0];
  if (!user || !user.localId) return null;
  return { uid: user.localId, email: user.email || "" };
}

function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

async function readEntitlements(env, uid) {
  const raw = await env.ENTITLEMENTS.get("user:" + uid);
  if (!raw) return { guides: {} };
  try {
    const data = JSON.parse(raw);
    return { guides: data.guides || {} };
  } catch (err) {
    return { guides: {} };
  }
}

async function writePurchase(env, uid, purchase) {
  const current = await readEntitlements(env, uid);
  current.guides[purchase.guideId] = purchase;
  current.updatedAt = new Date().toISOString();
  await env.ENTITLEMENTS.put("user:" + uid, JSON.stringify(current));
  return current.guides[purchase.guideId];
}

async function verifyPaystack(reference, env) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("missing Paystack secret");
  const res = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + secret, Accept: "application/json" }
  });
  const data = await res.json();
  if (!res.ok || !data.status || !data.data) {
    return { ok: false, message: (data && data.message) || "Paystack could not verify that payment." };
  }
  return { ok: true, tx: data.data };
}

function purchaseFromTx(tx, expected, quote) {
  const meta = tx.metadata || {};
  const guideId = (quote && quote.guideId) || expected.guideId || meta.guideId;
  if (!guideId) return { ok: false, message: "Missing guide." };
  if (String(tx.status).toLowerCase() !== "success") {
    return { ok: false, message: "Payment is not complete." };
  }
  if (!quote) {
    return { ok: false, message: "This checkout expired. Please try again." };
  }
  if (expected.uid && quote.uid && quote.uid !== expected.uid) {
    return { ok: false, message: "This payment belongs to a different account." };
  }
  if (expected.uid && meta.uid && meta.uid !== expected.uid) {
    return { ok: false, message: "This payment belongs to a different account." };
  }
  if (quote.guideId && quote.guideId !== guideId) {
    return { ok: false, message: "Payment does not match this guide." };
  }
  const catalog = guideCatalog().get(guideId);
  if (!catalog || catalog.free) {
    return { ok: false, message: "Unknown or free guide." };
  }
  const txCurrency = String(tx.currency || "").toUpperCase();
  if (txCurrency && txCurrency !== CHARGE_CURRENCY) {
    return { ok: false, message: "Payment currency does not match." };
  }
  if (Number(tx.amount) !== Number(quote.amount)) {
    return { ok: false, message: "Payment amount does not match the quoted price." };
  }
  return {
    ok: true,
    purchase: {
      guideId: guideId,
      title: catalog.title,
      source: "paystack",
      reference: tx.reference,
      amount: tx.amount,
      sourceAmount: catalog.price,
      sourceCurrency: "EUR",
      currency: txCurrency || CHARGE_CURRENCY,
      rate: quote.rate,
      rateDate: quote.rateDate || "",
      rateSource: quote.rateSource || "",
      purchasedAt: tx.paid_at || new Date().toISOString(),
      test: String(tx.domain || "") === "test" || String(expected.secretHint || "").indexOf("sk_test_") === 0
    }
  };
}

async function handleQuote(request, env) {
  const user = await lookupFirebaseUser(bearer(request), env);
  if (!user) return json(request, { ok: false, message: "Please sign in and try again." }, 401);
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json(request, { ok: false, message: "Invalid request." }, 400);
  }
  const guideId = String((body && body.guideId) || "").trim();
  if (!guideId) return json(request, { ok: false, message: "Missing guide." }, 400);
  const catalog = guideCatalog().get(guideId);
  if (!catalog || catalog.free) {
    return json(request, { ok: false, message: "Unknown or free guide." }, 400);
  }
  const fx = await getDailyRate(env);
  const amount = zarCents(catalog.price, fx.rate);
  if (!amount || amount < 100) {
    return json(request, { ok: false, message: "Could not price this guide." }, 500);
  }
  const safeGuide = guideId.replace(/[^a-z0-9-]/gi, "");
  const reference = "ew_" + user.uid.slice(0, 12) + "_" + safeGuide + "_" + Date.now();
  const quote = {
    uid: user.uid,
    email: user.email || "",
    guideId: guideId,
    title: catalog.title,
    eurPrice: catalog.price,
    amount: amount,
    currency: CHARGE_CURRENCY,
    rate: fx.rate,
    rateDate: fx.date || "",
    rateSource: fx.source || "",
    createdAt: new Date().toISOString()
  };
  await saveQuote(env, reference, quote);
  return json(request, {
    ok: true,
    reference: reference,
    amount: amount,
    currency: CHARGE_CURRENCY
  });
}

async function handleVerify(request, env) {
  const user = await lookupFirebaseUser(bearer(request), env);
  if (!user) return json(request, { ok: false, message: "Please sign in and try again." }, 401);
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json(request, { ok: false, message: "Invalid request." }, 400);
  }
  const reference = String((body && body.reference) || "").trim();
  const guideId = String((body && body.guideId) || "").trim();
  if (!reference) return json(request, { ok: false, message: "Missing payment reference." }, 400);
  const verified = await verifyPaystack(reference, env);
  if (!verified.ok) return json(request, { ok: false, message: verified.message }, 400);
  const quote = await loadQuote(env, reference);
  const built = purchaseFromTx(verified.tx, {
    uid: user.uid,
    guideId: guideId,
    secretHint: env.PAYSTACK_SECRET_KEY || ""
  }, quote);
  if (!built.ok) return json(request, { ok: false, message: built.message }, 400);
  const saved = await writePurchase(env, user.uid, built.purchase);
  return json(request, { ok: true, purchase: saved });
}

async function handleScript(request, env) {
  const url = new URL(request.url);
  const guideId = String(url.searchParams.get("guide") || "").trim();
  const requested = String(url.searchParams.get("lang") || "en").trim().toLowerCase();
  const lang = requested === "zh-hans" || requested === "zh-cn" ? "zh" : requested;
  if (!guideId || !/^[a-z0-9-]+$/i.test(guideId)) {
    return json(request, { ok: false, message: "Missing guide." }, 400);
  }
  if (!/^[a-z]{2,8}$/.test(lang)) {
    return json(request, { ok: false, message: "Missing language." }, 400);
  }
  const catalog = guideCatalog().get(guideId);
  if (!catalog) return json(request, { ok: false, message: "Unknown guide." }, 404);
  if (!catalog.free) {
    const user = await lookupFirebaseUser(bearer(request), env);
    if (!user) return json(request, { ok: false, message: "Please sign in." }, 401);
    const entitlements = await readEntitlements(env, user.uid);
    if (!entitlements.guides || !entitlements.guides[guideId]) {
      return json(request, { ok: false, message: "This guide is not on your account." }, 403);
    }
  }
  let used = lang;
  let fallback = false;
  let raw = await env.ENTITLEMENTS.get("script:" + guideId + ":" + lang);
  if (!raw && lang !== "en") {
    raw = await env.ENTITLEMENTS.get("script:" + guideId + ":en");
    used = "en";
    fallback = true;
  }
  if (!raw) return json(request, { ok: false, message: "Script not available." }, 404);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return json(request, { ok: false, message: "Script not available." }, 500);
  }
  return json(request, {
    ok: true,
    guideId: guideId,
    lang: used,
    requested: lang,
    fallback: fallback,
    stops: data.stops || []
  });
}

async function handleMe(request, env) {
  const user = await lookupFirebaseUser(bearer(request), env);
  if (!user) return json(request, { ok: false, message: "Please sign in." }, 401);
  const entitlements = await readEntitlements(env, user.uid);
  return json(request, { ok: true, uid: user.uid, guides: entitlements.guides });
}

async function handleWebhook(request, env) {
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";
  const secret = env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY || "";
  if (!secret) return json(request, { ok: false, message: "Webhook is not configured." }, 500);
  const expected = await hmacHex(secret, raw);
  if (expected !== signature) return json(request, { ok: false, message: "Invalid signature." }, 401);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    return json(request, { ok: false, message: "Invalid payload." }, 400);
  }
  if (payload.event && payload.event !== "charge.success") {
    return json(request, { ok: true, ignored: true });
  }
  const tx = payload.data || {};
  const meta = tx.metadata || {};
  const quote = await loadQuote(env, tx.reference || "");
  const uid = (quote && quote.uid) || meta.uid;
  const built = purchaseFromTx(tx, {
    uid: uid,
    guideId: (quote && quote.guideId) || meta.guideId,
    secretHint: env.PAYSTACK_SECRET_KEY || ""
  }, quote);
  if (!built.ok || !uid) return json(request, { ok: false, message: built.message || "Missing account." }, 400);
  const saved = await writePurchase(env, uid, built.purchase);
  return json(request, { ok: true, purchase: saved });
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (request.method === "POST" && (path === "/quote" || path.endsWith("/quote"))) {
        return await handleQuote(request, env);
      }
      if (request.method === "POST" && (path === "/verify" || path.endsWith("/verify"))) {
        return await handleVerify(request, env);
      }
      if (request.method === "GET" && (path === "/script" || path.endsWith("/script"))) {
        return await handleScript(request, env);
      }
      if (request.method === "GET" && (path === "/me" || path.endsWith("/me"))) {
        return await handleMe(request, env);
      }
      if (request.method === "POST" && (path === "/webhook" || path.endsWith("/webhook"))) {
        return await handleWebhook(request, env);
      }
      return json(request, { ok: false, message: "Not found." }, 404);
    } catch (err) {
      return json(request, { ok: false, message: "Server error." }, 500);
    }
  }
};
