/* After a purchase is confirmed, load the remaining read-along script into
   each [data-script-source="purchase"] placeholder (and into newly unlocked
   stops). Scripts are optional static JSON at /data/scripts/<guideId>.json.
   Generate those files later from the app catalog; audio unlock does not
   depend on them. */
(function () {
  function esc(text) {
    return String(text || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function paragraphsToHtml(paragraphs) {
    return (paragraphs || []).map(function (p) {
      return "<p>" + esc(p) + "</p>";
    }).join("");
  }

  function attachReadAlong(stopNode, paragraphs) {
    if (!stopNode || !paragraphs || !paragraphs.length) return;
    if (stopNode.querySelector(".read-along")) return;
    var details = document.createElement("details");
    details.className = "read-along";
    details.innerHTML = "<summary>Read along</summary><div class=\"transcript\">" + paragraphsToHtml(paragraphs) + "</div>";
    var audio = stopNode.querySelector(".stop-audio");
    if (audio) audio.insertAdjacentElement("afterend", details);
    else stopNode.appendChild(details);
  }

  window.earwiseLoadPurchasedScript = function (guideId, lang) {
    if (!guideId) return Promise.resolve(null);
    var code = lang || "en";
    var url = "/data/scripts/" + encodeURIComponent(guideId) + ".json";
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (!data) return null;
      var pack = (data.languages && (data.languages[code] || data.languages.en)) || data.stops || null;
      if (!pack) return null;
      var items = Array.isArray(pack) ? pack : pack.stops;
      if (!items) return null;
      items.forEach(function (stop) {
        var number = Number(stop.number || stop.stop);
        if (!number) return;
        var li = null;
        document.querySelectorAll(".stops li").forEach(function (item) {
          var num = item.querySelector(".num");
          if (num && Number(num.textContent) === number) li = item;
        });
        if (!li) return;
        attachReadAlong(li, stop.paragraphs || stop.script || []);
      });
      return data;
    }).catch(function () { return null; });
  };
})();
