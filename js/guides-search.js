(function () {
  var input = document.getElementById("q");
  var block = document.getElementById("hit-block");
  var hits = document.getElementById("hits");
  var empty = document.getElementById("empty");
  var regions = Array.prototype.slice.call(document.querySelectorAll("[data-region]"));
  var cards = Array.prototype.slice.call(document.querySelectorAll(".country-card"));
  var list = window.EARWISE_ATTRACTIONS || [];
  if (!input) return;

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function apply() {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      block.hidden = true;
      hits.innerHTML = "";
      cards.forEach(function (card) { card.hidden = false; });
      regions.forEach(function (region) { region.hidden = false; });
      empty.hidden = true;
      return;
    }
    var countryCount = 0;
    regions.forEach(function (region) {
      var any = false;
      Array.prototype.forEach.call(region.querySelectorAll(".country-card"), function (card) {
        var hay = (card.getAttribute("data-guide") || "").toLowerCase();
        var show = hay.indexOf(q) !== -1;
        card.hidden = !show;
        if (show) any = true;
      });
      region.hidden = !any;
      if (any) countryCount += 1;
    });
    var found = list.filter(function (item) {
      var hay = (item.q + " " + item.title + " " + item.place + " " + item.country).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    if (!found.length) {
      block.hidden = true;
      hits.innerHTML = "";
    } else {
      block.hidden = false;
      hits.innerHTML = found.map(function (item) {
        return '<a class="hit" href="' + esc(item.href) + '"><span>' + esc(item.title) + '</span><small>' + esc(item.place) + " · " + esc(item.country) + "</small></a>";
      }).join("");
    }
    empty.hidden = countryCount > 0 || found.length > 0;
  }

  input.addEventListener("input", apply);
})();
