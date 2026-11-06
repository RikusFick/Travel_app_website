(function () {
  var el = document.getElementById("guide-map");
  if (!el || !window.L) return;
  var pins = [];
  try { pins = JSON.parse(el.getAttribute("data-pins") || "[]"); } catch (e) { pins = []; }
  if (!pins.length) return;
  var map = L.map(el, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  var bounds = [];
  pins.forEach(function (pin) {
    L.marker([pin.lat, pin.lon]).addTo(map).bindTooltip(pin.name, { permanent: pins.length > 1, direction: "top" });
    bounds.push([pin.lat, pin.lon]);
  });
  if (bounds.length === 1) map.setView(bounds[0], 17);
  else map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
})();
