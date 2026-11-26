(function () {
  var el = document.getElementById("guide-map");
  if (!el || !window.L) return;
  var pins = [];
  try { pins = JSON.parse(el.getAttribute("data-pins") || "[]"); } catch (e) { pins = []; }
  if (!pins.length) return;

  var SHARE_METERS = 5;

  function haversineMeters(a, b) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLon = (b.lon - a.lon) * toRad;
    var lat1 = a.lat * toRad;
    var lat2 = b.lat * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function parsePin(pin) {
    var raw = String(pin.name || "");
    var m = raw.match(/^(\d+)\.\s*(.*)$/);
    return {
      lat: Number(pin.lat),
      lon: Number(pin.lon),
      num: m ? Number(m[1]) : null,
      title: m ? m[2] : raw,
      name: raw
    };
  }

  function near(a, b) {
    if (a.lat === b.lat && a.lon === b.lon) return true;
    return haversineMeters(a, b) < SHARE_METERS;
  }

  function groupPins(list) {
    var items = list.map(parsePin);
    var used = items.map(function () { return false; });
    var groups = [];
    for (var i = 0; i < items.length; i++) {
      if (used[i]) continue;
      var group = [items[i]];
      used[i] = true;
      var changed = true;
      while (changed) {
        changed = false;
        for (var j = 0; j < items.length; j++) {
          if (used[j]) continue;
          for (var k = 0; k < group.length; k++) {
            if (near(group[k], items[j])) {
              group.push(items[j]);
              used[j] = true;
              changed = true;
              break;
            }
          }
        }
      }
      groups.push(group);
    }
    return groups;
  }

  function formatStopLabel(nums) {
    var sorted = nums.slice().sort(function (a, b) { return a - b; });
    var parts = [];
    var start = sorted[0];
    var prev = sorted[0];
    for (var i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === prev + 1) {
        prev = sorted[i];
        continue;
      }
      parts.push(start === prev ? String(start) : (start + "–" + prev));
      if (i < sorted.length) {
        start = prev = sorted[i];
      }
    }
    return parts.join(", ");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function groupCenter(group) {
    var lat = 0, lon = 0;
    group.forEach(function (p) { lat += p.lat; lon += p.lon; });
    return [lat / group.length, lon / group.length];
  }

  var groups = groupPins(pins);
  var shared = groups.some(function (g) { return g.length > 1; });
  var map = L.map(el, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var bounds = [];
  groups.forEach(function (group) {
    var center = groupCenter(group);
    bounds.push(center);
    if (group.length === 1) {
      var pin = group[0];
      L.marker(center).addTo(map).bindTooltip(pin.name, {
        permanent: pins.length > 1 && pins.length <= 5,
        direction: "top"
      });
      return;
    }
    var nums = group.map(function (p) { return p.num; }).filter(function (n) { return n != null; });
    var label = formatStopLabel(nums);
    var icon = L.divIcon({
      className: "pin-cluster",
      html: '<span class="pin-cluster-badge">' + escapeHtml(label) + "</span>",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -18]
    });
    var lines = group.slice().sort(function (a, b) {
      return (a.num || 0) - (b.num || 0);
    }).map(function (p) {
      var n = p.num != null ? p.num + ". " : "";
      return "<li>" + escapeHtml(n + p.title) + "</li>";
    }).join("");
    var stopsLabel = window.earwiseT ? window.earwiseT("Stops {range}", { range: label }) : "Stops " + label;
    var popup = '<div class="pin-popup"><p>' + escapeHtml(stopsLabel) + "</p><ol>" + lines + "</ol></div>";
    L.marker(center, { icon: icon }).addTo(map).bindPopup(popup).bindTooltip(stopsLabel, {
      permanent: groups.length > 1 && groups.length <= 5,
      direction: "top"
    });
  });

  if (bounds.length === 1) map.setView(bounds[0], 17);
  else map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });

  if (shared) {
    var note = document.querySelector(".map-note");
    if (note) {
      var count = (note.textContent.match(/\d+/) || [""])[0];
      var tr = window.earwiseT || function (s, v) { return s.replace("{n}", v.n); };
      note.innerHTML = note.innerHTML.replace(
        tr("All {n} stop pins for this guide are marked.", { n: count }),
        tr("All {n} stops are marked; some stops share a pin.", { n: count })
      );
    }
  }
})();
