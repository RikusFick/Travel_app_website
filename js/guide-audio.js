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

  select.addEventListener('change', function () {
    applyLang(select.value);
  });

  applyLang(select.value);
})();
