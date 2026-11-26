/* Earwise site language: text lookup for scripts, the flag picker in the
   header, and remembering the visitor's choice. Loaded in <head> on every page.
   Per-language text lives in i18n/strings/<lang>.json; the builder
   (tools/i18n/build.py) writes the strings scripts need to js/i18n/<lang>.js. */
(function () {
  var root = document.documentElement;
  var lang = root.getAttribute("data-lang") || "en";
  var prefix = root.getAttribute("data-lang-root") || "";
  var dict = (window.EARWISE_I18N && window.EARWISE_I18N.strings) || {};
  var KEY = "earwise_lang";

  function fill(text, vars) {
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : all;
    });
  }

  /* T("English text", {name: value}) -> the page language's text, or English. */
  window.earwiseT = function (text, vars) {
    var hit = Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : text;
    return fill(hit, vars);
  };
  /* Site-absolute path in the page language: "/louvre/" -> "/fr/louvre/". */
  window.earwisePath = function (path) {
    path = String(path || "/");
    if (!prefix || path.charAt(0) !== "/" || path.charAt(1) === "/") return path;
    if (/^\/(img|js|css|data|audio)\//.test(path)) return path;
    if (path === prefix || path.indexOf(prefix + "/") === 0) return path;
    return prefix + path;
  };
  window.earwiseLang = lang;

  function stored() {
    try { return localStorage.getItem(KEY) || ""; } catch (err) { return ""; }
  }

  function remember(code) {
    try { localStorage.setItem(KEY, code); } catch (err) { /* private mode */ }
  }

  /* A visitor who picked a language once lands on that language next time.
     Only English pages redirect, and only when the page has that version. */
  var want = stored();
  if (want && want !== lang && lang === "en" && !/[?&]lang=en\b/.test(location.search)) {
    var alt = document.querySelector('link[rel="alternate"][data-lang="' + want + '"]');
    var to = alt && alt.getAttribute("href");
    if (to) {
      /* Same site: keep only the path, so this also works on preview hosts. */
      location.replace(to.replace(/^https?:\/\/[^/]+/, "") + location.search + location.hash);
      return;
    }
  }

  function wire() {
    var pickers = document.querySelectorAll(".lang-pick");
    Array.prototype.forEach.call(pickers, function (picker) {
      picker.addEventListener("click", function (event) {
        var link = event.target && event.target.closest && event.target.closest("a[data-lang]");
        if (!link) return;
        var code = link.getAttribute("data-lang");
        remember(code);
        /* The guide player starts in the site language next time. */
        if (window.earwisePrefs && window.earwisePrefs.write) {
          window.earwisePrefs.write({ language: code });
        }
        var target = link.getAttribute("href") || "/";
        if (location.hash) {
          event.preventDefault();
          location.href = target + location.hash;
        }
      });
      picker.addEventListener("toggle", function () {
        if (picker.open) {
          var nav = document.getElementById("site-nav");
          var btn = document.querySelector(".nav-toggle");
          if (nav && nav.classList.contains("is-open") && btn) btn.click();
        }
      });
    });
    document.addEventListener("click", function (event) {
      Array.prototype.forEach.call(pickers, function (picker) {
        if (picker.open && !picker.contains(event.target)) picker.open = false;
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      Array.prototype.forEach.call(pickers, function (picker) {
        if (picker.open) {
          picker.open = false;
          var summary = picker.querySelector("summary");
          if (summary) summary.focus();
        }
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
