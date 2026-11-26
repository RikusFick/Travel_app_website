/* Country filter for the Travel tips hub. Cards are rendered in the HTML from data/tips.json. */
(function () {
  var root = document.querySelector("[data-tips-hub]");
  if (!root) return;
  var chips = root.querySelectorAll("[data-tips-filter]");
  var cards = root.querySelectorAll(".tips-card");
  var empty = root.querySelector("[data-tips-empty]");

  function apply(country) {
    var visible = 0;
    chips.forEach(function (chip) {
      var on = chip.getAttribute("data-tips-filter") === country;
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
    cards.forEach(function (card) {
      var match = country === "all" || card.getAttribute("data-country") === country;
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      apply(chip.getAttribute("data-tips-filter"));
    });
  });

  var start = "all";
  try {
    var q = new URLSearchParams(window.location.search).get("country");
    if (q) {
      var wanted = q.trim();
      cards.forEach(function (card) {
        if (card.getAttribute("data-country") === wanted) start = wanted;
      });
    }
  } catch (e) {}
  apply(start);
})();
