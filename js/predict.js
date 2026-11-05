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

  function hide() {
    box.hidden = true;
    box.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    active = -1;
    matches = [];
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
  }

  function show() {
    var q = input.value.trim().toLowerCase();
    if (!q) { hide(); return; }
    matches = list.filter(function (item) {
      var hay = (item.title + " " + item.q + " " + item.place + " " + item.country).toLowerCase();
      return hay.indexOf(q) !== -1;
    }).slice(0, 8);
    active = matches.length ? 0 : -1;
    if (!matches.length) { hide(); return; }
    paint();
  }

  input.addEventListener("input", show);
  input.addEventListener("keydown", function (event) {
    if (box.hidden) return;
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
})();
