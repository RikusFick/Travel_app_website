/* Earwise on-page guide audio: play/pause per stop, no autoplay, preload=none. */
(function () {
  var dataEl = document.getElementById('earwise-audio');
  if (!dataEl) return;

  var data;
  try { data = JSON.parse(dataEl.textContent); }
  catch (err) { return; }
  if (!data || !data.id || !data.base || !data.languages) return;

  document.documentElement.classList.add('has-audio-js');

  var select = document.getElementById('audio-lang-select');
  var wraps = Array.prototype.slice.call(document.querySelectorAll('.stop-audio'));
  if (!select || !wraps.length) return;

  var LANG_NAMES = {en:'English',es:'Spanish',fr:'French',de:'German',it:'Italian',pt:'Portuguese',ru:'Russian',ja:'Japanese',hi:'Hindi',zh:'Chinese'};
  var LANG_ORDER = ['en','es','fr','de','it','pt','ru','ja','hi','zh'];

  function langsWithAudio() {
    var codes = LANG_ORDER.filter(function (code) {
      return Array.isArray(data.languages[code]) && data.languages[code].length > 0;
    });
    Object.keys(data.languages).forEach(function (code) {
      if (codes.indexOf(code) === -1 && Array.isArray(data.languages[code]) && data.languages[code].length > 0) {
        codes.push(code);
      }
    });
    return codes;
  }

  function syncSelect(current) {
    var codes = langsWithAudio();
    var keep = codes.indexOf(current) !== -1 ? current : (codes.indexOf('en') !== -1 ? 'en' : codes[0]);
    select.innerHTML = '';
    codes.forEach(function (code) {
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = LANG_NAMES[code] || code;
      if (code === keep) opt.selected = true;
      select.appendChild(opt);
    });
    var wrap = select.closest('.audio-lang');
    if (wrap) wrap.hidden = codes.length === 0;
    select.disabled = codes.length === 0;
    return keep || 'en';
  }

  function clipUrl(lang, stop) {
    return data.base + '/' + lang + '/' + data.id + '-' + stop + '.mp3';
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) return '0:00';
    var s = Math.floor(t);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function setPlaying(wrap, playing) {
    var btn = wrap.querySelector('.player-toggle');
    var label = wrap.querySelector('.player-label');
    var title = wrap.getAttribute('data-title') || ('stop ' + wrap.getAttribute('data-stop'));
    if (!btn) return;
    btn.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' ' + title);
    if (label) label.textContent = playing ? 'Pause' : 'Play';
  }

  function resetTime(wrap) {
    var elapsed = wrap.querySelector('.t-elapsed');
    if (elapsed) elapsed.textContent = '0:00';
  }

  function pauseOthers(except) {
    wraps.forEach(function (wrap) {
      if (wrap === except) return;
      var audio = wrap.querySelector('audio');
      if (audio && !audio.paused) audio.pause();
    });
  }

  function availableStops(lang) {
    return data.languages[lang] || [];
  }

  function applyLang(lang) {
    var stops = availableStops(lang);
    wraps.forEach(function (wrap) {
      var stop = Number(wrap.getAttribute('data-stop'));
      var audio = wrap.querySelector('audio');
      var ok = stops.indexOf(stop) !== -1;
      wrap.hidden = !ok;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('controls');
      audio.preload = 'none';
      if (ok) {
        audio.src = clipUrl(lang, stop);
      } else {
        audio.removeAttribute('src');
        audio.load();
      }
      setPlaying(wrap, false);
      resetTime(wrap);
    });
  }

  wraps.forEach(function (wrap) {
    wrap.dataset.bound = "1";
    var audio = wrap.querySelector('audio');
    var btn = wrap.querySelector('.player-toggle');
    var elapsed = wrap.querySelector('.t-elapsed');
    var duration = wrap.querySelector('.t-duration');
    if (!audio || !btn) return;

    audio.removeAttribute('controls');
    audio.preload = 'none';
    audio.autoplay = false;

    btn.addEventListener('click', function () {
      if (audio.paused) {
        pauseOthers(wrap);
        var playPromise = audio.play();
        if (playPromise && playPromise.catch) playPromise.catch(function () {});
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', function () { setPlaying(wrap, true); });
    audio.addEventListener('pause', function () { setPlaying(wrap, false); });
    audio.addEventListener('ended', function () {
      audio.currentTime = 0;
      setPlaying(wrap, false);
      resetTime(wrap);
    });
    audio.addEventListener('loadedmetadata', function () {
      if (duration) duration.textContent = fmt(audio.duration);
    });
    audio.addEventListener('timeupdate', function () {
      if (elapsed) elapsed.textContent = fmt(audio.currentTime);
    });
  });

  var initial = syncSelect(select.value);
  select.addEventListener('change', function () {
    applyLang(select.value);
  });

  applyLang(initial);

  window.earwiseBindAudioPlayers = function () {
    wraps = Array.prototype.slice.call(document.querySelectorAll('.stop-audio'));
    wraps.forEach(function (wrap) {
      if (wrap.dataset.bound) return;
      wrap.dataset.bound = "1";
      var audio = wrap.querySelector('audio');
      var btn = wrap.querySelector('.player-toggle');
      var elapsed = wrap.querySelector('.t-elapsed');
      var duration = wrap.querySelector('.t-duration');
      if (!audio || !btn) return;
      audio.removeAttribute('controls');
      audio.preload = 'none';
      audio.autoplay = false;
      btn.addEventListener('click', function () {
        if (audio.paused) {
          pauseOthers(wrap);
          var playPromise = audio.play();
          if (playPromise && playPromise.catch) playPromise.catch(function () {});
        } else {
          audio.pause();
        }
      });
      audio.addEventListener('play', function () { setPlaying(wrap, true); });
      audio.addEventListener('pause', function () { setPlaying(wrap, false); });
      audio.addEventListener('ended', function () {
        audio.currentTime = 0;
        setPlaying(wrap, false);
        resetTime(wrap);
      });
      audio.addEventListener('loadedmetadata', function () {
        if (duration) duration.textContent = fmt(audio.duration);
      });
      audio.addEventListener('timeupdate', function () {
        if (elapsed) elapsed.textContent = fmt(audio.currentTime);
      });
    });
    if (select) applyLang(select.value || initial);
  };
})();


window.earwiseUnlockGuideAudio = function (info) {
  if (!info || !info.id || !info.base) return;
  var toolbar = document.querySelector(".audio-toolbar-note");
  if (toolbar) toolbar.textContent = "Full guide: every stop is unlocked in this browser. Offline listening stays in the app.";
  var dataEl = document.getElementById("earwise-audio");
  if (dataEl) {
    var current = {};
    try { current = JSON.parse(dataEl.textContent); } catch (err) { current = {}; }
    current.mode = "full";
    current.languages = info.languages || current.languages;
    dataEl.textContent = JSON.stringify(current);
  }
  var langSelect = document.getElementById("audio-lang-select");
  var lang = (langSelect && langSelect.value) || "en";
  var stops = (info.languages && info.languages[lang]) || (info.languages && info.languages.en) || [];
  document.querySelectorAll(".stop-locked").forEach(function (lock) {
    var item = lock.closest("li");
    if (!item) return;
    var numEl = item.querySelector(".num");
    var titleEl = item.querySelector("h3");
    var stop = numEl ? Number(numEl.textContent) : 0;
    if (!stop) return;
    var title = titleEl ? titleEl.textContent : ("Stop " + stop);
    var wrap = document.createElement("div");
    wrap.className = "stop-audio";
    wrap.setAttribute("data-stop", String(stop));
    wrap.setAttribute("data-title", "stop " + stop + ": " + title);
    var src = info.base + "/" + lang + "/" + info.id + "-" + stop + ".mp3";
    wrap.innerHTML =
      '<div class="player">' +
      '<button type="button" class="player-toggle" aria-label="Play stop ' + stop + ": " + title.replace(/"/g, "&quot;") + '">' +
      '<svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13L19 12 8 5.5z"/></svg>' +
      '<svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7V5zm6 0h4v14h-4V5z"/></svg>' +
      "</button>" +
      '<div class="player-ui"><span class="player-label">Play</span><span class="player-time"><span class="t-elapsed">0:00</span> / <span class="t-duration">–:––</span></span></div>' +
      '<audio preload="none" controls src="' + src + '"></audio></div>';
    lock.replaceWith(wrap);
  });
  if (typeof window.earwiseBindAudioPlayers === "function") {
    window.earwiseBindAudioPlayers();
  }
};
