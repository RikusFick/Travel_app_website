(function () {
  var input = document.getElementById("q");
  var cards = Array.prototype.slice.call(document.querySelectorAll("[data-guide]"));
  var rows = Array.prototype.slice.call(document.querySelectorAll("[data-row]"));
  var empty = document.getElementById("empty");
  if (!input) return;

  function apply() {
    var q = input.value.trim().toLowerCase();
    cards.forEach(function (card) {
      var hay = card.getAttribute("data-guide") || "";
      card.hidden = q.length > 0 && hay.indexOf(q) === -1;
    });
    var any = false;
    rows.forEach(function (row) {
      var visible = row.querySelectorAll("[data-guide]:not([hidden])").length > 0;
      row.hidden = !visible;
      if (visible) any = true;
    });
    empty.hidden = any || q.length === 0;
    document.body.classList.toggle("is-filtering", q.length > 0);
  }

  input.addEventListener("input", apply);
})();
