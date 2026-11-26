/* Earwise on-page guide audio: play/pause per stop, no autoplay, preload=none. */
(function () {
  var T = function (s, v) { return window.earwiseT ? window.earwiseT(s, v) : s; };
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

  var LANG_NAMES = {en:T("English"),es:T("Spanish"),fr:T("French"),de:T("German"),it:T("Italian"),pt:T("Portuguese"),ru:T("Russian"),ja:T("Japanese"),hi:T("Hindi"),zh:T("Chinese")};
  var LANG_ORDER = ['en','es','fr','de','it','pt','ru','ja','hi','zh'];

  function preferredLang() {
    var prefs = window.earwisePrefs && window.earwisePrefs.read && window.earwisePrefs.read();
    return (prefs && prefs.language) || '';
  }

  function preferredRate() {
    var prefs = window.earwisePrefs && window.earwisePrefs.read && window.earwisePrefs.read();
    var rate = prefs && Number(prefs.playbackRate);
    return (rate === 0.75 || rate === 1 || rate === 1.25 || rate === 1.5) ? rate : 1;
  }

  function applyRate(audio) {
    if (audio) audio.playbackRate = preferredRate();
  }

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
    var title = wrap.getAttribute('data-title') || T('stop {n}', { n: wrap.getAttribute('data-stop') });
    if (!btn) return;
    btn.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', T(playing ? 'Pause {title}' : 'Play {title}', { title: title }));
    if (label) label.textContent = playing ? T("Pause") : T("Play");
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
      if (ok) {
        audio.preload = 'metadata';
        applyRate(audio);
        if (audio.src !== clipUrl(lang, stop)) audio.src = clipUrl(lang, stop);
        else if (audio.readyState >= 1) {
          var durationEl = wrap.querySelector('.t-duration');
          if (durationEl && isFinite(audio.duration) && audio.duration > 0) durationEl.textContent = fmt(audio.duration);
        }
      } else {
        audio.preload = 'none';
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
    applyRate(audio);

    btn.addEventListener('click', function () {
      if (audio.paused) {
        pauseOthers(wrap);
        applyRate(audio);
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

  /* A translated page starts in its own language when that audio exists. */
  var pageLang = (document.documentElement.getAttribute('lang') || 'en').split('-')[0];
  var pageHasAudio = pageLang !== 'en' && Array.isArray(data.languages[pageLang]) && data.languages[pageLang].length > 0;
  var initial = syncSelect(pageHasAudio ? pageLang : (preferredLang() || select.value));
  select.addEventListener('change', function () {
    applyLang(select.value);
    window.dispatchEvent(new CustomEvent('earwise-audio-lang', { detail: { lang: select.value } }));
  });

  applyLang(initial);

  function allStopNumbers(count) {
    var n = Number(count) || 0;
    if (!n) {
      document.querySelectorAll(".stops li .num").forEach(function (el) {
        var num = Number(el.textContent);
        if (num > n) n = num;
      });
    }
    var list = [];
    for (var i = 1; i <= n; i++) list.push(i);
    return list;
  }

  function expandLanguages(langs, count) {
    var all = allStopNumbers(count);
    var out = {};
    var src = langs || {};
    Object.keys(src).forEach(function (code) {
      if (Array.isArray(src[code]) && src[code].length) out[code] = all.slice();
    });
    if (!Object.keys(out).length && all.length) out.en = all;
    return out;
  }

  function adoptCatalog(info) {
    if (!info) return;
    if (info.id) data.id = info.id;
    if (info.base) data.base = info.base;
    data.mode = info.mode || data.mode || "full";
    if (info.languages) data.languages = info.languages;
    if (dataEl) {
      dataEl.textContent = JSON.stringify({
        id: data.id,
        mode: data.mode,
        base: data.base,
        languages: data.languages
      });
    }
  }

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
      audio.preload = 'metadata';
      audio.autoplay = false;
      applyRate(audio);
      btn.addEventListener('click', function () {
        if (audio.paused) {
          pauseOthers(wrap);
          applyRate(audio);
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

  window.earwiseUnlockGuideAudio = function (info) {
    if (!info || !info.id || !info.base) return;
    var toolbar = document.querySelector(".audio-toolbar-note");
    if (toolbar) toolbar.textContent = T("Full guide: every stop is unlocked in this browser. You can also play it in the Earwise app.");
    document.querySelectorAll(".audio-sample-label").forEach(function (el) { el.remove(); });
    var langs = expandLanguages(info.languages || data.languages, info.stops);
    adoptCatalog({ id: info.id, base: info.base, mode: "full", languages: langs });
    var langSelect = document.getElementById("audio-lang-select");
    var lang = (langSelect && langSelect.value) || "en";
    document.querySelectorAll(".stop-locked").forEach(function (lock) {
      var item = lock.closest("li");
      if (!item) return;
      var numEl = item.querySelector(".num");
      var titleEl = item.querySelector("h3");
      var stop = numEl ? Number(numEl.textContent) : 0;
      if (!stop) return;
      var title = titleEl ? titleEl.textContent : T("Stop {n}", { n: stop });
      var wrap = document.createElement("div");
      wrap.className = "stop-audio";
      wrap.setAttribute("data-stop", String(stop));
      wrap.setAttribute("data-title", T("stop {n}: {title}", { n: stop, title: title }));
      var src = info.base + "/" + lang + "/" + info.id + "-" + stop + ".mp3";
      wrap.innerHTML =
        '<div class="player">' +
        '<button type="button" class="player-toggle" aria-label="' + T("Play stop {n}: {title}", { n: stop, title: title }).replace(/"/g, "&quot;") + '">' +
        '<svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13L19 12 8 5.5z"/></svg>' +
        '<svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7V5zm6 0h4v14h-4V5z"/></svg>' +
        "</button>" +
        '<div class="player-ui"><span class="player-label">' + T("Play") + '</span><span class="player-time"><span class="t-elapsed">0:00</span> / <span class="t-duration">–:––</span></span></div>' +
        '<audio preload="metadata" controls src="' + src + '"></audio></div>';
      lock.replaceWith(wrap);
    });
    window.earwiseBindAudioPlayers();
  };
})();
