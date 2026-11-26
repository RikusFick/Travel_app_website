(function () {
  var input = document.getElementById("q");
  var list = window.EARWISE_ATTRACTIONS || [];
  if (!input || !list.length) return;

  var box = document.createElement("ul");
  box.className = "suggest";
  box.id = "suggest";
  box.hidden = true;
  box.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "suggest");
  input.parentNode.appendChild(box);

  var matches = [];
  var active = -1;

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function startsWithWord(text, q) {
    return String(text).split(/[\s/,]+/).some(function (word) {
      return word.indexOf(q) === 0;
    });
  }

  function score(item, q) {
    var title = (item.title || "").toLowerCase();
    var country = (item.country || "").toLowerCase();
    var place = (item.place || "").toLowerCase();
    var extra = (item.q || "").toLowerCase();
    if (country === q || country.indexOf(q) === 0 || startsWithWord(country, q)) return 100;
    if (title === q || title.indexOf(q) === 0) return 80;
    if (startsWithWord(title, q)) return 70;
    if (place === q || place.indexOf(q) === 0 || startsWithWord(place, q)) return 50;
    if (title.indexOf(q) !== -1) return 40;
    if (place.indexOf(q) !== -1) return 30;
    if (extra.indexOf(q) !== -1) return 10;
    return 0;
  }

  function hide() {
    box.hidden = true;
    box.innerHTML = "";
    box.classList.remove("is-above");
    box.style.maxHeight = "";
    input.setAttribute("aria-expanded", "false");
    active = -1;
    matches = [];
  }

  function placeBox() {
    if (box.hidden) return;
    var rect = input.getBoundingClientRect();
    var vv = window.visualViewport;
    var viewTop = vv ? vv.offsetTop : 0;
    var viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    var spaceBelow = viewBottom - rect.bottom - 16;
    var spaceAbove = rect.top - viewTop - 16;
    var cap = Math.round((vv ? vv.height : window.innerHeight) * 0.6);
    var useAbove = spaceBelow < 132 && spaceAbove > spaceBelow;
    var available = useAbove ? spaceAbove : spaceBelow;
    box.classList.toggle("is-above", useAbove);
    box.style.maxHeight = Math.max(88, Math.min(cap, available)) + "px";
  }

  function paint() {
    box.innerHTML = matches.map(function (item, i) {
      return '<li role="option" id="suggest-' + i + '" aria-selected="' + (i === active ? "true" : "false") + '">' +
        '<a href="' + esc(item.href) + '"><span>' + esc(item.title) + '</span><small>' + esc(item.country) + "</small></a></li>";
    }).join("");
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", "suggest-" + active);
    else input.removeAttribute("aria-activedescendant");
    placeBox();
  }

  function show() {
    var q = input.value.trim().toLowerCase();
    if (!q) { hide(); return; }
    matches = list.map(function (item) {
      return { item: item, score: score(item, q) };
    }).filter(function (row) {
      return row.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score;
    }).slice(0, 8).map(function (row) {
      return row.item;
    });
    active = matches.length ? 0 : -1;
    if (!matches.length) {
      box.innerHTML = '<li class="suggest-empty" role="option" aria-selected="false" aria-disabled="true">No results. Try another name or place.</li>';
      box.hidden = false;
      input.setAttribute("aria-expanded", "true");
      input.removeAttribute("aria-activedescendant");
      placeBox();
      return;
    }
    paint();
  }

  input.addEventListener("input", show);
  input.addEventListener("keydown", function (event) {
    if (box.hidden) return;
    if (!matches.length) {
      if (event.key === "Escape") hide();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(matches.length - 1, active + 1);
      paint();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(0, active - 1);
      paint();
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      location.href = matches[active].href;
    } else if (event.key === "Escape") {
      hide();
    }
  });
  document.addEventListener("click", function (event) {
    if (!input.parentNode.contains(event.target)) hide();
  });
  window.addEventListener("resize", placeBox);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", placeBox);
    window.visualViewport.addEventListener("scroll", placeBox);
  }
})();
