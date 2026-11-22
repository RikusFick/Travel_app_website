/* Earwise mobile navigation menu toggle */
(function () {
  var btn = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  var header = document.querySelector(".site-header");
  if (!btn || !nav || !header) return;

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
  }

  btn.addEventListener("click", function () {
    setOpen(!nav.classList.contains("is-open"));
  });

  nav.addEventListener("click", function (event) {
    if (event.target && event.target.closest("a")) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      var returnFocus = header.contains(document.activeElement);
      setOpen(false);
      if (returnFocus) btn.focus();
    }
  });

  document.addEventListener("click", function (event) {
    if (nav.classList.contains("is-open") && !header.contains(event.target)) {
      setOpen(false);
    }
  });

  if (window.matchMedia) {
    var mq = window.matchMedia("(min-width: 900px)");
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
