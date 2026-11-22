/* Canonical charge-currency rules. Keep this file in sync with
   data/currency.json and worker/purchase/src/currency.json.
   Charge currency is ZAR (set 22 Nov 2026). The website shows euro prices
   and a "Charged as ZAR … at checkout" note. Switch to "USD" only if
   Paystack later enables dollars. */
window.EARWISE_CURRENCY = {
  "sourceCurrency": "EUR",
  "chargeCurrency": "ZAR",
  "asOf": "2026-11-22",
  "rates": {
    "USD": 1.1,
    "ZAR": 19.25
  },
  "rule": {
    "USD": "USD = round(EUR \u00d7 1.10 to the nearest cent). Rate 1.10 is a fixed website rate set on 22 Nov 2026 from a mid-market rate of about 1.097.",
    "ZAR": "ZAR fallback: ZAR = (integer part of EUR \u00d7 19.25) + 0.99, a .99 charm price at or above the converted amount. Rate 19.25 is a fixed website rate set on 22 Nov 2026 from a mid-market rate of about 19.24\u201319.27."
  },
  "tiers": {
    "1.99": {
      "USD": 2.19,
      "ZAR": 38.99
    },
    "2.99": {
      "USD": 3.29,
      "ZAR": 57.99
    },
    "3.99": {
      "USD": 4.39,
      "ZAR": 76.99
    }
  }
};

window.earwiseCharge = function (eurPrice) {
  var rules = window.EARWISE_CURRENCY || {};
  var cur = String(rules.chargeCurrency || "ZAR").toUpperCase();
  var eur = Math.round(Number(eurPrice) * 100) / 100;
  var key = eur.toFixed(2);
  var amount;
  if (rules.tiers && rules.tiers[key] && rules.tiers[key][cur] != null) {
    amount = Number(rules.tiers[key][cur]);
  } else if (cur === "USD") {
    amount = Math.round(eur * Number((rules.rates && rules.rates.USD) || 1.1) * 100) / 100;
  } else if (cur === "ZAR") {
    var raw = eur * Number((rules.rates && rules.rates.ZAR) || 19.25);
    amount = raw === Math.floor(raw) ? raw - 0.01 : Math.floor(raw) + 0.99;
  } else {
    amount = eur;
    cur = "EUR";
  }
  return {
    sourceCurrency: "EUR",
    sourceAmount: eur,
    currency: cur,
    amount: Math.round(amount * 100) / 100,
    minor: Math.round(amount * 100)
  };
};

window.earwiseFormatEuro = function (eurPrice) {
  var eur = Math.round(Number(eurPrice) * 100) / 100;
  if (!isFinite(eur)) return "";
  return "€" + eur.toFixed(2);
};

window.earwiseFormatCharge = function (charge) {
  if (!charge) return "";
  if (charge.currency === "USD") return "$" + charge.amount.toFixed(2);
  if (charge.currency === "ZAR") return "ZAR " + charge.amount.toFixed(2);
  if (charge.currency === "EUR") return "€" + charge.amount.toFixed(2);
  return charge.currency + " " + charge.amount.toFixed(2);
};
