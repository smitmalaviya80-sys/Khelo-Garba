/* Garbo player prototype: player logic, sheets and states.
   Playback is simulated with a clock. All song facts come from sample.json. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  var LIVE_SITE = new URLSearchParams(location.search).get('live') === '1' && window.parent !== window;
  var prototypeStates = document.querySelector('.proto-states');
  if (prototypeStates) prototypeStates.hidden = LIVE_SITE;
  var LIVE_STATE_READY = false;
  var LIVE_CHANNEL = 'playgarba:immersive-prototype';
  var LIVE_NONSTOP_TITLE = '';
  var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var mirrors = new window.GarboScene.MirrorBand($('mirrorBand'));

  /* ---------- Atmosphere: the venue the player stands in, and the sound of the circle around the song ----------
     The venue scene and the sound engine are the shared production files. When they are not available the
     player falls back to the plain garbo scene and the Atmosphere sheet explains why. */
  var E = window.GARBA_ATMOSPHERE_ENGINE, VENUE_SCENE = !!window.GarbaVenueScene && !!E;
  var ATMO_MODES = {
    crowd: { label: 'Crowd', profile: { crowd: 1, night: 1, claps: 0, spatial: false } },
    clapping: { label: 'Claps', profile: { crowd: 0.35, night: 0.6, claps: 1, spatial: false } },
    immersive: { label: 'Full circle', profile: { crowd: 0.85, night: 1, claps: 0.9, spatial: true } }
  };
  var A = { youAs: 'woman', styleChoice: null, sound: false, mode: 'immersive', venue: 'outdoors', listener: 'circle', pattern: 'beat', bpm: 112, ctx: null, engine: null, timer: 0, taps: [], running: false };
  try { var savedAtmo = JSON.parse(localStorage.getItem('garbo-proto-atmosphere') || '{}'); ['mode', 'venue', 'listener', 'pattern', 'youAs'].forEach(function (k) { if (savedAtmo[k]) A[k] = savedAtmo[k]; }); } catch (e) { /* storage unavailable */ }
  if (E && (!E.VENUES[A.venue] || !E.LISTENERS[A.listener])) { A.venue = 'outdoors'; A.listener = 'circle'; }

  var scene = VENUE_SCENE ? new window.GarboScene.VenueStage($('scene'), {
    venues: E.VENUES,
    reduce: reducedQuery.matches,
    clock: function () { return A.ctx ? A.ctx.currentTime : performance.now() / 1000; },
    beats: function () {
      var tp = A.running && A.engine && A.engine.tempo;
      if (!tp || !(ATMO_MODES[A.mode].profile.claps > 0)) return null;
      var pat = E.PATTERNS[A.pattern];
      return { anchor: tp.anchor, period: tp.period, cycle: pat.cycle, hits: pat.hits };
    },
    onLamp: function (l) {
      var hit = $('lampHit'), tip = $('lampTip'), r = $('lampSlot').getBoundingClientRect(), lx = l.x * window.innerWidth - r.left, ly = l.y * window.innerHeight - r.top;
      hit.style.left = lx + 'px'; hit.style.top = ly + 'px';
      // By the stage or at the DJ's table the garbo is behind you: no tip floating over the player, no hidden target over the crowd
      var away = A.listener === 'stage' || document.documentElement.classList.contains('dj-mode');
      hit.style.pointerEvents = away ? 'none' : '';
      if (tip) tip.style.visibility = away ? 'hidden' : '';
      // The first-time tip sits just below the garbo, wherever the scene puts it
      if (tip && !tip.hidden && !away) { tip.style.left = lx + 'px'; tip.style.top = (ly + Math.max(30, l.r * window.innerWidth * 1.6)) + 'px'; }
    }
  }) : new window.GarboScene.Scene($('scene'));
  if (VENUE_SCENE) document.documentElement.classList.add('venue-stage');

  var STEPS = [
    { name: 'Be tali', desc: 'Two claps in each round', claps: 2 },
    { name: 'Tran tali', desc: 'Three claps in each round', claps: 3 },
    { name: 'Hinch', desc: 'Mixes Garba and Raas movement', claps: 0 },
    { name: 'Dodhiyu', desc: 'Four steps forward, two steps back', claps: 0 },
    { name: 'Popatiyu', desc: 'The parrot step, led by the shoulders and hands', claps: 0 },
    { name: 'Raas', desc: 'Danced in pairs with dandiya sticks', claps: 0 }
  ];

  var S = {
    data: null, genres: [], genre: 'traditional',
    queue: [], index: 0, track: null,
    mode: 'ember', resumeMode: 'ember', pos: 0,
    shuffle: false, saved: new Set(), offline: false,
    nonstop: null, nonstopSetsStatus: LIVE_SITE ? 'loading' : 'ready', tonight: null, live: false, hosted: null, loadTimer: null,
    // Songs asked for at the DJ's table. On the live site the player keeps this list and sends it back as upNext.
    upNext: [], liveUpNext: null, circle: false
  };
  var LV = null, lives = { mine: [], joined: [] }, songById = {};
  // Features load the first time they're used, not with the page
  var loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise(function (ok, fail) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = function () { delete loaded[src]; fail(new Error(src)); }; document.head.appendChild(sc); });
    return loaded[src];
  }
  function needLives() {
    if (LV) return Promise.resolve(LV);
    return loadScript('lives.js').then(function () { LV = window.GarboLives; lives = LV.load(); return LV; });
  }

  try { JSON.parse(localStorage.getItem('garbo-proto-saved') || '[]').forEach(function (id) { S.saved.add(id); }); } catch (e) { /* storage unavailable */ }

  /* ---------- helpers ---------- */
  function fmt(sec) {
    if (sec == null || !isFinite(sec)) return '';
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function genreInfo(id) { for (var i = 0; i < S.genres.length; i++) if (S.genres[i].id === id) return S.genres[i]; return null; }
  function playableIn(genre) { return S.data.songs.filter(function (s) { return s.genre === genre && s.playable; }); }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- now playing ---------- */
  function trackView() {
    var t = S.track;
    if (!t) return { eyebrow: '', title: '', artist: '', from: null };
    if (t.kind === 'empty') return { eyebrow: t.eyebrow, title: t.title, artist: t.artist, from: null };
    if (t.kind === 'chapter') {
      var set = t.set;
      return { eyebrow: '', title: t.title, artist: set.artists.join(', '), from: { text: set.title, script: 'latn' } };
    }
    var g = genreInfo(t.song.genre);
    var eyebrow = S.hosted ? '' : S.live ? '24/7 Live' : LIVE_NONSTOP_TITLE ? 'Nonstop Garba' : S.tonight ? 'Tonight · ' + (S.tonight.part + 1) + ' of ' + TONIGHT.length : '';
    var rel = t.song.release;
    return { eyebrow: eyebrow, title: t.song.title, artist: t.song.artist, from: rel ? { text: rel.title, script: rel.script, year: rel.year } : null };
  }

  function renderNP(animate) {
    var np = $('np');
    // Read the track when the change lands, so a quick second change (a live link opening on load) wins
    var apply = function () {
      var v = trackView();
      $('eyebrow').textContent = v.eyebrow;
      renderPerch();
      var title = $('title');
      title.textContent = v.title;
      title.title = v.title;
      title.classList.toggle('long', v.title.length > 34);
      $('artist').textContent = v.artist;
      var from = $('from'); from.textContent = '';
      if (v.from) {
        from.append('From ');
        var span = el('span', null, v.from.text);
        if (v.from.script === 'gu') span.lang = 'gu';
        from.append(span);
      }
      np.classList.remove('swap');
    };
    if (animate && !reducedQuery.matches) { np.classList.add('swap'); setTimeout(apply, 170); } else apply();
    $('heartBtn').setAttribute('aria-pressed', String(!!(S.track && S.track.song && S.saved.has(S.track.song.id))));
    renderTime();
    markCurrentRows();
  }

  function duration() {
    var t = S.track;
    if (!t) return null;
    if (t.kind === 'chapter') return t.set.durationSeconds;
    if (t.kind === 'song') {
      if (t.song.durationSeconds) return t.song.durationSeconds;
      if (!LIVE_SITE && ytPlayer && ytReady) {
        try {
          var yd = ytPlayer.getDuration();
          if (yd && isFinite(yd) && yd > 0) return yd;
        } catch (e) {}
      }
      return null;
    }
    return null;
  }

  function progress() {
    var t = S.track;
    if (!t || S.live) return 0;
    if (t.kind === 'chapter') {
      var set = t.set, n = set.chapters.length, c = t.chapterIndex;
      if (set.durationSeconds) return S.pos / set.durationSeconds;
      var start = set.chapters[c].startSeconds, next = set.chapters[c + 1];
      var within = next ? Math.min(1, (S.pos - start) / (next.startSeconds - start)) : 0;
      return (c + within) / n;
    }
    var d = duration();
    return d ? S.pos / d : 0;
  }

  function chapterMarks() {
    var t = S.track;
    if (!t || t.kind !== 'chapter') return null;
    var set = t.set, n = set.chapters.length;
    return set.chapters.map(function (ch, i) { return set.durationSeconds ? ch.startSeconds / set.durationSeconds : i / n; });
  }

  function renderTime() {
    var elapsed = $('elapsed'), dur = $('duration'), sep = document.querySelector('.time-sep');
    elapsed.className = ''; sep.hidden = false;
    if (!S.track || S.track.kind === 'empty') { elapsed.textContent = ''; dur.textContent = ''; sep.hidden = true; return; }
    if (S.live) { elapsed.textContent = 'Live now'; elapsed.className = 'live-now'; dur.textContent = ''; sep.hidden = true; return; }
    if (S.hosted && S.hosted.waiting) { elapsed.textContent = 'Starts in ' + fmt(S.hosted.startsIn); elapsed.className = 'live-now'; dur.textContent = ''; sep.hidden = true; $('ringSeek').disabled = true; return; }
    var d = duration();
    elapsed.textContent = fmt(S.pos);
    dur.textContent = d ? fmt(d) : 'Duration unknown';
    var seek = $('ringSeek');
    seek.disabled = !!S.hosted || (!d && !(S.track.kind === 'chapter'));
    seek.value = String(Math.round(Math.min(1, progress()) * 1000));
    seek.setAttribute('aria-valuetext', fmt(S.pos) + (d ? ' of ' + fmt(d) : ''));
  }

  /* ---------- modes ---------- */
  var HINTS = {
    ember: '',
    paused: 'Paused',
    loading: 'Lighting the lamp…',
    playing: 'Swipe the genres below for more',
    live: '',
    offline: '',
    unavailable: 'No verified YouTube route yet',
    empty: 'Try another genre'
  };

  function setMode(mode) {
    S.mode = mode;
    app.dataset.state = mode;
    app.dataset.playing = String(mode === 'playing' || mode === 'live');
    var playing = app.dataset.playing === 'true';
    $('playBtn').setAttribute('aria-label', mode === 'loading' ? 'Loading' : playing ? 'Pause' : 'Play');
    $('lampHit').setAttribute('aria-label', playing ? 'Pause' : 'Light the garbo to play');
    var blocked = mode === 'unavailable' || mode === 'empty' || mode === 'offline';
    $('playBtn').disabled = blocked;
    $('lampHit').disabled = blocked;
    $('hint').textContent = HINTS[mode] || '';
    renderTip();
    $('offlineBar').hidden = mode !== 'offline';
    $('liveBtn').setAttribute('aria-pressed', String(S.live || !!S.hosted));
    scene.set({ mode: mode === 'paused' ? 'ember' : mode === 'empty' ? 'unavailable' : mode });
    if (typeof atmoSync === 'function') atmoSync();
  }

  function requestLiveAction(action, value) {
    if (!LIVE_SITE || !LIVE_STATE_READY) return false;
    window.parent.postMessage({ channel: LIVE_CHANNEL, type: 'action', action: action, value: value }, location.origin);
    return true;
  }

  var viewSwitch = document.querySelector('[data-view-switch]');
  if (viewSwitch) {
    viewSwitch.closest('.view-switch').hidden = false;
    viewSwitch.addEventListener('click', function () {
      if (LIVE_SITE) {
        window.parent.postMessage({ channel: LIVE_CHANNEL, type: 'view', view: 'simple' }, location.origin);
      } else {
        try { localStorage.setItem('garba:view', 'simple'); } catch (e) {}
        var isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        window.location.href = isLocalDev ? '/' : '../../../../';
      }
    });
  }

  var brandLink = document.querySelector('.brand');
  if (brandLink && !LIVE_SITE) {
    var isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    brandLink.setAttribute('href', isLocalDev ? '/' : '../../../../');
  }

  var pendingLiveSnapshot = null;
  function applyLiveState(snapshot) {
    if (!LIVE_SITE || !snapshot || typeof snapshot !== 'object') return;
    if (!S.data) {
      if (Array.isArray(snapshot.songs)) {
        S.data = {
          songs: snapshot.songs,
          genres: Array.isArray(snapshot.genres) ? snapshot.genres : (S.genres || []),
          nonstopSets: Array.isArray(snapshot.nonstopSets) ? snapshot.nonstopSets : []
        };
        S.genres = S.data.genres;
        snapshot.songs.forEach(function (song) { songById[song.id] = song; });
        buildDial(); buildChips(); buildSteps(); buildTonight(); buildStates();
        setGenre(snapshot.genreId || (snapshot.song && snapshot.song.genre) || 'traditional', false);
        relayout();
      } else {
        pendingLiveSnapshot = snapshot;
        return;
      }
    }
    LIVE_STATE_READY = true;
    var catalogueChanged = false;
    if (Array.isArray(snapshot.songs)) {
      S.data.songs = snapshot.songs;
      catalogueChanged = true;
      S.genres = Array.isArray(snapshot.genres) ? snapshot.genres : S.genres;
      songById = {};
      S.data.songs.forEach(function (song) { songById[song.id] = song; });
      S.queue = S.data.songs.filter(function (song) { return song.playable; });
      S.index = Math.max(0, S.queue.findIndex(function (song) { return snapshot.song && song.id === snapshot.song.id; }));
      $('dialTrack').textContent = '';
      $('genreChips').textContent = '';
      dialButtons.length = 0;
      buildDial(); buildChips();
    }
    if (Array.isArray(snapshot.nonstopSets)) {
      S.data.nonstopSets = snapshot.nonstopSets;
      S.nonstopSetsStatus = snapshot.nonstopSetsStatus === 'loading' || snapshot.nonstopSetsStatus === 'error'
        ? snapshot.nonstopSetsStatus
        : 'ready';
      catalogueChanged = true;
    } else if (snapshot.nonstopSetsStatus === 'loading' || snapshot.nonstopSetsStatus === 'error') {
      S.data.nonstopSets = [];
      S.nonstopSetsStatus = snapshot.nonstopSetsStatus;
      catalogueChanged = true;
    }
    if (snapshot.song) {
      var song = songById[snapshot.song.id] || snapshot.song;
      if (!songById[song.id]) songById[song.id] = song;
      if (Number.isFinite(snapshot.durationSeconds) && snapshot.durationSeconds > 0) {
        song = Object.assign({}, song, { durationSeconds: snapshot.durationSeconds });
      }
      S.track = { kind: 'song', song: song };
    }
    S.genre = snapshot.genreId || (snapshot.song && snapshot.song.genre) || S.genre;
    LIVE_NONSTOP_TITLE = snapshot.nonstop && snapshot.nonstop.title || '';
    S.shuffle = Boolean(snapshot.shuffle);
    if (snapshot.song) {
      if (snapshot.favourite) S.saved.add(snapshot.song.id);
      else S.saved.delete(snapshot.song.id);
    }
    S.live = Boolean(snapshot.live);
    S.circle = Boolean(snapshot.circle);
    S.liveUpNext = Array.isArray(snapshot.upNext) ? snapshot.upNext : null;
    S.hosted = null;
    S.nonstop = null;
    S.pos = Number.isFinite(snapshot.elapsedSeconds) ? Math.max(0, snapshot.elapsedSeconds) : 0;
    $('shuffleBtn').setAttribute('aria-pressed', String(S.shuffle));
    $('liveBtn').setAttribute('aria-pressed', String(S.live));
    renderDial();
    if (S.track) {
      renderNP(false);
      renderTime();
      var current = duration();
      scene.set({ progress: current ? Math.min(1, S.pos / current) : 0 });
      setMode(S.live ? 'live' : snapshot.playing ? 'playing' : 'paused');
    }
    var circleBridge = $('circleBridge');
    if (circleBridge) {
      circleBridge.hidden = false;
      circleBridge.setAttribute('aria-pressed', String(Boolean(snapshot.circle)));
    }
    if (catalogueChanged && openSheet && openSheet.id === 'exploreSheet') renderRows();
    else if (openSheet && openSheet.id === 'exploreSheet') renderDecks();
  }

  if (LIVE_SITE) {
    window.addEventListener('message', function (event) {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      var message = event.data;
      if (!message || message.channel !== LIVE_CHANNEL || message.type !== 'state') return;
      applyLiveState(message.snapshot);
    });
    window.addEventListener('load', function () {
      window.parent.postMessage({ channel: LIVE_CHANNEL, type: 'ready' }, location.origin);
    }, { once: true });
  }

  /* ---------- standalone YouTube audio/video player ---------- */
  var ytPlayer = null, ytReady = false, ytCurrentVideo = null, ytCurrentStart = 0;
  var ytContainer = null;

  function initYtPlayer() {
    if (LIVE_SITE || ytPlayer) return;
    ytContainer = document.createElement('div');
    ytContainer.id = 'ytPlayerDock';
    ytContainer.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:320px;height:180px;pointer-events:none;opacity:0.01;z-index:-1;';
    var mount = document.createElement('div');
    mount.id = 'ytMount';
    ytContainer.appendChild(mount);
    document.body.appendChild(ytContainer);

    function onYtReady() {
      ytPlayer = new window.YT.Player('ytMount', {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          enablejsapi: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: location.origin
        },
        events: {
          onReady: function () {
            ytReady = true;
            if (S.mode === 'playing') ytPlayCurrent();
          },
          onStateChange: function (event) {
            if (!window.YT) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              clearTimeout(S.loadTimer);
              setMode('playing');
              syncVideoDock();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              if (S.mode === 'playing') setMode('paused');
            } else if (event.data === window.YT.PlayerState.ENDED) {
              step(1);
            }
          }
        }
      });
    }

    if (window.YT && window.YT.Player) {
      onYtReady();
    } else {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === 'function') prev();
        onYtReady();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }

  function syncVideoDock() {
    if (!ytContainer) return;
    var vFrame = $('videoSheet')?.querySelector('.video-frame');
    if (!vFrame) return;
    var isVideoSheetOpen = openSheet && openSheet.id === 'videoSheet';
    if (isVideoSheetOpen) {
      ytContainer.style.cssText = 'width:100%;height:100%;position:relative;bottom:auto;left:auto;opacity:1;pointer-events:auto;z-index:1;';
      if (ytContainer.parentNode !== vFrame) vFrame.replaceChildren(ytContainer);
    } else {
      ytContainer.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:320px;height:180px;pointer-events:none;opacity:0.01;z-index:-1;';
      if (ytContainer.parentNode !== document.body) document.body.appendChild(ytContainer);
    }
  }

  function ytPlayCurrent() {
    if (LIVE_SITE) return;
    if (!ytPlayer || !ytReady) {
      initYtPlayer();
      return;
    }
    var vid = null, start = 0;
    if (S.track) {
      if (S.track.kind === 'song' && S.track.song) {
        vid = S.track.song.videoId;
        start = S.track.song.startSeconds || 0;
      } else if (S.track.kind === 'chapter' && S.track.set) {
        vid = S.track.set.videoId;
        start = S.track.set.chapters[S.track.chapterIndex]?.startSeconds || 0;
      }
    }
    if (!vid) return;
    if (ytCurrentVideo !== vid) {
      ytCurrentVideo = vid;
      ytCurrentStart = start;
      try {
        ytPlayer.loadVideoById({ videoId: vid, startSeconds: start });
      } catch (e) {}
    } else {
      try {
        ytPlayer.playVideo();
      } catch (e) {}
    }
  }

  function ytPause() {
    if (LIVE_SITE || !ytPlayer || !ytReady) return;
    try { ytPlayer.pauseVideo(); } catch (e) {}
  }

  function ytSeekTo(seconds) {
    if (LIVE_SITE || !ytPlayer || !ytReady) return;
    try {
      var target = (ytCurrentStart || 0) + seconds;
      ytPlayer.seekTo(target, true);
    } catch (e) {}
  }

  // "Tap the garbo to light it" shows under the garbo until the first time it's lit, then never again
  var tipSeen = false; try { tipSeen = localStorage.getItem('garbo-proto-lit') === '1'; } catch (e) { /* storage unavailable */ }
  function renderTip() { var tip = $('lampTip'); if (tip) tip.hidden = tipSeen || S.mode !== 'ember'; }
  function play() {
    if (requestLiveAction('play')) return;
    if (!tipSeen) { tipSeen = true; try { localStorage.setItem('garbo-proto-lit', '1'); } catch (e) { /* storage unavailable */ } renderTip(); }
    if (S.offline || !S.track) return;
    if (S.track.kind === 'song' && !S.track.song.playable) { setMode('unavailable'); return; }
    if (S.track.kind === 'empty') return;
    clearTimeout(S.loadTimer);
    setMode('loading');
    ytPlayCurrent();
    S.loadTimer = setTimeout(function () { if (S.mode === 'loading') setMode(S.live || S.hosted ? 'live' : 'playing'); }, 1300);
  }
  function pause() {
    if (requestLiveAction('play')) return;
    clearTimeout(S.loadTimer);
    ytPause();
    setMode('paused');
  }
  function toggle() {
    if (requestLiveAction('play')) return;
    if (S.mode === 'playing' || S.mode === 'live' || S.mode === 'loading') pause(); else play();
  }

  /* ---------- queue ---------- */
  function loadSong(song, keepPlaying) {
    if (requestLiveAction('song', song.id)) return;
    S.nonstop = null;
    S.track = { kind: 'song', song: song };
    S.pos = 0;
    scene.set({ chapters: null, chapterIndex: -1 });
    renderNP(true);
    if (!song.playable) {
      clearTimeout(S.loadTimer);
      ytPause();
      setMode('unavailable');
      return;
    }
    if (ytCurrentVideo !== song.videoId) {
      ytCurrentVideo = null;
    }
    if (keepPlaying) play(); else setMode(S.offline ? 'offline' : 'ember');
  }

  function loadSet(set, chapterIndex, keepPlaying) {
    if (requestLiveAction('nonstop', set.id)) return;
    S.live = false;
    S.nonstop = set;
    var c = Math.max(0, Math.min(set.chapters.length - 1, chapterIndex || 0));
    S.track = { kind: 'chapter', set: set, chapterIndex: c, title: set.chapters[c].title };
    S.pos = set.chapters[c].startSeconds;
    scene.set({ chapters: chapterMarks(), chapterIndex: c });
    renderNP(true);
    if (ytCurrentVideo !== set.videoId) {
      ytCurrentVideo = null;
    }
    if (keepPlaying) play(); else setMode(S.offline ? 'offline' : 'ember');
  }

  function setGenre(id, keepPlaying) {
    if (requestLiveAction('genre', id)) return;
    S.genre = id;
    A.styleChoice = null;
    if (typeof atmoRender === 'function' && $('atmoPower')) atmoRender();
    renderDial();
    if (id === 'nonstop') { S.queue = []; loadSet(S.data.nonstopSets[0], 0, keepPlaying); return; }
    S.queue = playableIn(id);
    S.index = 0;
    if (!S.queue.length) {
      var g = genreInfo(id);
      S.nonstop = null;
      S.track = { kind: 'empty', eyebrow: '', title: 'No ' + (g ? g.name : id) + ' songs to play yet', artist: 'No verified YouTube routes in this sample.' };
      scene.set({ chapters: null, chapterIndex: -1 });
      clearTimeout(S.loadTimer);
      renderNP(true); setMode('empty');
      return;
    }
    loadSong(S.queue[0], keepPlaying);
  }

  function isActive() { return S.mode === 'playing' || S.mode === 'live' || S.mode === 'loading'; }

  function step(dir) {
    if (requestLiveAction(dir < 0 ? 'previous' : 'next')) return;
    if (S.hosted) { hostedStep(dir); return; }
    var keep = isActive();
    var t = S.track;
    if (t && t.kind === 'chapter') {
      var c = t.chapterIndex + dir;
      if (c >= t.set.chapters.length) { if (S.tonight) return advanceTonight(keep); c = 0; }
      if (c < 0) c = 0;
      loadSet(t.set, c, keep); return;
    }
    if (dir > 0 && S.upNext.length && !S.tonight) {
      var asked = S.upNext.shift();
      S.genre = asked.genre; renderDial();
      S.queue = playableIn(asked.genre); S.index = Math.max(0, S.queue.indexOf(asked));
      loadSong(asked, keep); return;
    }
    if (!S.queue.length) return;
    if (dir > 0 && S.tonight && S.index + 1 >= S.queue.length) return advanceTonight(keep);
    if (S.shuffle && dir > 0) {
      var n = S.queue.length, r = n > 1 ? (S.index + 1 + Math.floor(Math.random() * (n - 1))) % n : 0;
      S.index = r;
    } else {
      S.index = (S.index + dir + S.queue.length) % S.queue.length;
    }
    loadSong(S.queue[S.index], keep);
  }

  /* ---------- simulated clock ---------- */
  function tick(dt) {
    // A hosted live runs on the clock whether or not you are listening, so it is followed even while paused
    if (S.hosted) { hostedSync(false); return; }
    if (S.mode !== 'playing' && S.mode !== 'live') return;
    if (S.live) return;
    if (!LIVE_SITE && ytPlayer && ytReady) {
      try {
        var cur = ytPlayer.getCurrentTime();
        if (Number.isFinite(cur) && cur >= 0) {
          var start = ytCurrentStart || 0;
          S.pos = Math.max(0, cur - start);
        } else {
          S.pos += dt;
        }
      } catch (e) {
        S.pos += dt;
      }
    } else {
      S.pos += dt;
    }
    var t = S.track;
    if (t.kind === 'chapter') {
      var next = t.set.chapters[t.chapterIndex + 1];
      if (next && S.pos >= next.startSeconds) {
        t.chapterIndex++; t.title = next.title;
        scene.set({ chapterIndex: t.chapterIndex });
        renderNP(true);
      }
      if (t.set.durationSeconds && S.pos >= t.set.durationSeconds) step(1);
    } else {
      var d = duration();
      if (d && S.pos >= d) { step(1); return; }
    }
  }

  /* ---------- genre dial ---------- */
  var dialButtons = [];
  var measureCtx = document.createElement('canvas').getContext('2d');
  function buildDial() {
    var track = $('dialTrack');
    var items = [{ id: 'nonstop', name: 'Nonstop' }].concat(S.genres);
    items.forEach(function (g) {
      var b = el('button', null, g.name); b.type = 'button'; b.dataset.genre = g.id;
      b.addEventListener('click', function () { exitSpecial(); setGenre(g.id, isActive()); });
      track.appendChild(b); dialButtons.push(b);
    });
    var dial = $('dial'), startX = null, moved = false;
    dial.addEventListener('pointerdown', function (e) { startX = e.clientX; moved = false; });
    dial.addEventListener('pointermove', function (e) {
      if (startX == null) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 54) { moved = true; startX = e.clientX; moveDial(dx < 0 ? 1 : -1); }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { dial.addEventListener(n, function () { startX = null; }); });
    dial.addEventListener('click', function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    dial.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); moveDial(e.key === 'ArrowRight' ? 1 : -1); var cur = dial.querySelector('[aria-current="true"]'); if (cur) cur.focus(); }
    });
    $('dialPrev').addEventListener('click', function (e) { e.stopPropagation(); moveDial(-1); });
    $('dialNext').addEventListener('click', function (e) { e.stopPropagation(); moveDial(1); });
    dial.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) { e.preventDefault(); moveDial(e.deltaX > 0 ? 1 : -1); } }, { passive: false });
  }
  var dialTimer;
  function moveDial(dir) {
    if (!S.dialUsed) { S.dialUsed = true; HINTS.playing = ''; $('hint').textContent = HINTS[S.mode] || ''; }
    var ids = dialButtons.map(function (b) { return b.dataset.genre; });
    var i = Math.max(0, Math.min(ids.length - 1, ids.indexOf(S.genre) + dir));
    if (ids[i] === S.genre) return;
    S.genre = ids[i]; renderDial();
    clearTimeout(dialTimer);
    var keep = isActive();
    dialTimer = setTimeout(function () { exitSpecial(); setGenre(ids[i], keep); }, 220);
  }
  function renderDial() {
    var ids = dialButtons.map(function (b) { return b.dataset.genre; }), cur = ids.indexOf(S.genre);
    $('dialPrev').disabled = cur <= 0; $('dialNext').disabled = cur >= ids.length - 1;
    var half = ($('dial').clientWidth || 360) / 2, GAP = 26, arcR = half * (half > 250 ? 4.5 : 2.2);
    // Measure label text at its final size so positions don't depend on a running transition.
    var widths = dialButtons.map(function (b, i) {
      measureCtx.font = i === cur ? '600 16.5px "Anek Gujarati", system-ui, sans-serif' : '500 14px "Anek Gujarati", system-ui, sans-serif';
      return measureCtx.measureText(b.textContent).width + 16;
    });
    var xs = [], x = 0;
    xs[cur] = 0;
    for (var r = cur + 1; r < ids.length; r++) { x += widths[r - 1] / 2 + GAP + widths[r] / 2; xs[r] = x; }
    x = 0;
    for (var l = cur - 1; l >= 0; l--) { x -= widths[l + 1] / 2 + GAP + widths[l] / 2; xs[l] = x; }
    dialButtons.forEach(function (b, i) {
      var d = i - cur, off = Math.abs(xs[i]), visible = off < half + 20;
      b.style.left = xs[i] + 'px';
      b.style.top = (off * off / (2 * arcR)) + 'px';
      b.style.opacity = visible ? String(Math.max(0.25, 1 - off / (half * 1.15))) : '0';
      b.style.visibility = visible ? 'visible' : 'hidden';
      b.tabIndex = d === 0 ? 0 : -1;
      if (d === 0) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- live, tonight ---------- */
  function exitSpecial() { if (S.live) { S.live = false; } if (S.tonight) { S.tonight = null; } if (S.hosted) leaveHosted(false); }

  function toggleLive() {
    if (requestLiveAction('live')) return;
    if (S.hosted) leaveHosted(true);
    if (S.live) { S.live = false; setGenre(S.genre === 'nonstop' ? 'traditional' : S.genre, false); toast('Left 24/7 Live'); return; }
    S.tonight = null; S.live = true; S.nonstop = null;
    var pool = S.data.songs.filter(function (s) { return s.playable; });
    S.queue = pool; S.index = Math.floor(pool.length / 3);
    S.track = { kind: 'song', song: pool[S.index] };
    scene.set({ chapters: null, chapterIndex: -1 });
    renderNP(true);
    play();
  }

  var TONIGHT = [];
  function buildTonight() {
    var set = (S.data.nonstopSets && (S.data.nonstopSets[1] || S.data.nonstopSets[0])) || null;
    TONIGHT = [
      { label: 'Devotional Garba', genre: 'devotional', at: '9:00 pm' },
      { label: 'Traditional Garba', genre: 'traditional', at: '9:40 pm' },
      set ? { label: 'Nonstop set', set: set, at: '10:30 pm', detail: set.title } : { label: 'Nonstop set', genre: 'nonstop', at: '10:30 pm' },
      { label: 'Dandiya Raas', genre: 'dandiya', at: '11:30 pm' },
      { label: 'Modern Fusion Garba', genre: 'fusion', at: '12:20 am' }
    ];
    var list = $('nightList'); list.textContent = '';
    TONIGHT.forEach(function (p) {
      var li = el('li'); li.append(el('strong', null, p.label));
      li.append(el('span', null, p.at));
      if (p.detail) { var d = el('span', null, p.detail); d.style.gridColumn = '2 / -1'; d.style.marginTop = '-4px'; li.append(d); }
      list.append(li);
    });
    // Arc: the night rises from left to right
    var svg = $('nightArc'), NS = 'http://www.w3.org/2000/svg';
    svg.textContent = '';
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M14 128 C 90 124, 150 104, 200 76 S 300 20, 326 14');
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'rgba(214,176,111,.55)'); path.setAttribute('stroke-width', '2');
    svg.append(path);
    var len = path.getTotalLength ? path.getTotalLength() : 0;
    TONIGHT.forEach(function (p, i) {
      var pt = len ? path.getPointAtLength(len * (0.04 + i * 0.23)) : { x: 20 + i * 75, y: 120 - i * 25 };
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.setAttribute('r', '6');
      c.setAttribute('fill', '#160e0b'); c.setAttribute('stroke', '#d6b06f'); c.setAttribute('stroke-width', '2');
      c.setAttribute('r', '10');
      c.dataset.part = String(i);
      svg.append(c);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', pt.x); tx.setAttribute('y', pt.y + 4);
      tx.setAttribute('text-anchor', 'middle'); tx.dataset.part = String(i);
      tx.setAttribute('fill', '#d6b06f'); tx.setAttribute('font-size', '12'); tx.setAttribute('font-weight', '700'); tx.setAttribute('font-family', 'Anek Gujarati, system-ui, sans-serif');
      tx.textContent = String(i + 1); svg.append(tx);
    });
    [['9 pm', 14, 146, 'start'], ['1 am', 326, 40, 'end']].forEach(function (lab) {
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', lab[1]); tx.setAttribute('y', lab[2]); tx.setAttribute('text-anchor', lab[3]);
      tx.setAttribute('fill', '#978672'); tx.setAttribute('font-size', '11'); tx.setAttribute('font-family', 'Anek Gujarati, system-ui, sans-serif');
      tx.textContent = lab[0]; svg.append(tx);
    });
    $('startTonight').addEventListener('click', function () { closeSheet(); startTonightPart(0, true); });
  }
  function renderTonightMarks() {
    var part = S.tonight ? S.tonight.part : -1;
    $('nightArc').querySelectorAll('circle').forEach(function (c) { var i = +c.dataset.part; c.setAttribute('fill', i < part ? '#d6b06f' : i === part ? '#e8a33d' : '#160e0b'); c.setAttribute('r', i === part ? '12' : '10'); });
    $('nightArc').querySelectorAll('text[data-part]').forEach(function (t) { var i = +t.dataset.part; t.setAttribute('fill', i <= part ? '#3a1712' : '#d6b06f'); });
    $('nightList').querySelectorAll('li').forEach(function (li, i) { li.classList.toggle('now', i === part); });
    $('startTonight').textContent = S.tonight ? 'Restart tonight' : 'Start tonight';
  }
  function startTonightPart(i, keep) {
    S.live = false;
    var p = TONIGHT[i];
    S.tonight = { part: i, set: p.set || null };
    if (p.set) { S.genre = 'nonstop'; renderDial(); S.queue = []; loadSet(p.set, 0, keep); }
    else { S.genre = p.genre; renderDial(); S.queue = playableIn(p.genre).slice(0, 3); S.index = 0; loadSong(S.queue[0], keep); }
    renderTonightMarks();
  }
  function advanceTonight(keep) {
    var i = S.tonight.part + 1;
    if (i >= TONIGHT.length) { S.tonight = null; toast('That was tonight. Thanks for dancing.'); pause(); renderTonightMarks(); return; }
    startTonightPart(i, keep);
  }

  /* ---------- hosted lives ----------
     Someone hosts a live: an avatar, a name and a playlist that starts at a set moment. The link carries all of it,
     and every device works out the same song and second from the clock. The prototype uses the device clock;
     the player would use the server-aligned clock Live Radio already measures. */
  function lengthOf(id) { var s = songById[id]; return s && s.durationSeconds; }
  function nowSec() { return Date.now() / 1000; }
  function isMine(live) { return lives.mine.some(function (x) { return x.id === live.id; }); }
  function liveUrl(live) { return location.origin + location.pathname + location.search + '#live=' + LV.encode(live); }
  function clockTime(sec) { return new Date(sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function hostedSync(force) {
    var h = S.hosted, a = LV.at(h.live, lengthOf, nowSec());
    if (a.state === 'upcoming') {
      var first = songById[h.live.songs[0]]; h.startsIn = a.startsIn;
      if (force || !h.waiting) { h.waiting = true; h.index = 0; S.track = { kind: 'song', song: first }; S.pos = 0; renderNP(!force); if (first.genre && S.genre !== first.genre) { S.genre = first.genre; renderDial(); } }
      return;
    }
    var song = songById[h.live.songs[a.index]];
    if (force || h.waiting || h.index !== a.index || !S.track || S.track.song !== song) { h.waiting = false; h.index = a.index; S.track = { kind: 'song', song: song }; S.pos = a.offset; renderNP(!force); if (song.genre && S.genre !== song.genre) { S.genre = song.genre; renderDial(); } if (typeof atmoRender === 'function' && $('atmoPower')) atmoRender(); }
    S.pos = a.offset;
  }
  function tuneIn(live, keep) {
    S.hosted = null; exitSpecial(); S.nonstop = null; S.queue = [];
    S.hosted = { live: live, index: -1 };
    scene.set({ chapters: null, chapterIndex: -1 });
    hostedSync(true);
    if (typeof atmoRender === 'function' && $('atmoPower')) atmoRender();
    if (keep) play(); else setMode(S.offline ? 'offline' : 'ember');
  }
  function leaveHosted(quiet) {
    var name = LV.title(S.hosted.live); S.hosted = null;
    if (typeof atmoRender === 'function' && $('atmoPower')) atmoRender();
    if (!quiet) toast('You left ' + name);
  }
  function hostedStep(dir) {
    var live = S.hosted.live;
    if (!isMine(live)) { toast(live.host + ' picks the songs in this live.'); return; }
    if (dir < 0) { toast('A live only goes forward. Change the order in your playlist.'); return; }
    saveMine(LV.reanchor(live, live.songs, nowSec(), lengthOf, true));
    toast('Skipped. Share the new link so everyone follows.');
  }
  function saveMine(live) {
    LV.remember(lives, 'mine', live);
    if (S.hosted && S.hosted.live.id === live.id) { S.hosted.live = live; hostedSync(true); }
  }
  function joinFromLink(code) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    var live = LV && LV.decode(code, function (id) { var s = songById[id]; return !!(s && s.playable); });
    if (!live) { toast("This live link doesn't work. Ask the host to share it again."); return; }
    if (!isMine(live)) LV.remember(lives, 'joined', live);
    tuneIn(live, false);
    toast(isMine(live) ? 'Back in your live' : "You're in " + LV.title(live) + '. Tap the garbo to listen.');
  }
  // In someone's live, the Live button carries the live's name, with the host's avatar sitting on top of it
  function renderPerch() {
    if (!LV) return;
    var b = $('liveBtn'), old = b.querySelector('.avatar'); if (old) old.remove();
    b.classList.toggle('hosted', !!S.hosted);
    $('liveLabel').textContent = S.hosted ? LV.title(S.hosted.live) : '24/7 Live';
    if (S.hosted) { b.prepend(LV.avatarNode(S.hosted.live.avatar, 34, true)); b.setAttribute('aria-label', LV.title(S.hosted.live) + ', hosted by ' + S.hosted.live.host + '. Open Lives.'); }
    else b.removeAttribute('aria-label');
    b.setAttribute('aria-pressed', String(S.live || !!S.hosted));
  }
  function liveStatus(live) {
    var a = LV.at(live, lengthOf, nowSec());
    if (a.state === 'upcoming') return a.startsIn < 3600 ? 'Starts in ' + Math.max(1, Math.round(a.startsIn / 60)) + ' min' : 'Starts at ' + clockTime(live.start);
    var s = songById[live.songs[a.index]]; return 'On now · ' + (s ? s.title : '');
  }

  /* Lives sheet */
  function renderLives() {
    $('stationRow').setAttribute('aria-current', String(S.live));
    [['mine', 'mineList', 'mineHead'], ['joined', 'joinedList', 'joinedHead']].forEach(function (k) {
      var ul = $(k[1]); ul.textContent = ''; $(k[2]).hidden = !lives[k[0]].length;
      lives[k[0]].forEach(function (live) {
        var li = el('li'), b = el('button', 'live-card'); b.type = 'button';
        var txt = el('span'); txt.append(el('strong', null, LV.title(live)), el('small', null, (k[0] === 'mine' ? 'You host · ' : live.host + ' hosts · ') + liveStatus(live) + ' · ' + live.songs.length + (live.songs.length === 1 ? ' song' : ' songs')));
        b.append(LV.avatarNode(live.avatar, 40), txt);
        if (S.hosted && S.hosted.live.id === live.id) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', function () { closeSheet(); tuneIn(live, true); });
        li.append(b);
        if (k[0] === 'mine') {
          var ed = el('button', 'mini-btn', 'Edit'); ed.type = 'button'; ed.setAttribute('aria-label', 'Edit your live as ' + live.host); ed.addEventListener('click', function () { openHost(live); }); li.append(ed);
          var ln = el('button', 'mini-btn', 'Link'); ln.type = 'button'; ln.setAttribute('aria-label', 'Link to your live as ' + live.host); ln.addEventListener('click', function () { showLink(live, false); }); li.append(ln);
        } else {
          var x = el('button', 'ib'); x.type = 'button'; x.setAttribute('aria-label', 'Forget ' + live.host + "'s live"); x.innerHTML = '<svg><use href="#i-close"/></svg>';
          x.addEventListener('click', function () { lives.joined = lives.joined.filter(function (y) { return y.id !== live.id; }); LV.save(lives); renderLives(); $('hostNew').focus(); });
          li.append(x);
        }
        ul.append(li);
      });
    });
  }

  /* Host sheet */
  var START_AT = [['Now', 0], ['In 15 min', 15], ['In 30 min', 30], ['In 1 hour', 60]];
  var H = { editing: null, avatar: 0, start: 0, songs: [], chip: 'all' };
  function openHost(live) {
    var saved = {}; try { saved = JSON.parse(localStorage.getItem('garbo-proto-host') || '{}'); } catch (e) { /* storage unavailable */ }
    H.editing = live || null; H.start = 0;
    H.avatar = live ? live.avatar : saved.avatar >= 0 && saved.avatar < LV.AVATARS.length ? saved.avatar : 0;
    H.songs = live ? live.songs.slice() : [];
    $('hostName').value = live ? live.host : LV.cleanName(saved.name || '');
    $('hostTitleIn').value = live ? live.title || '' : '';
    $('hostTitle').textContent = live ? 'Edit your live' : 'Host a live';
    $('hostGo').textContent = live ? 'Save changes' : 'Go live';
    $('hostEnd').hidden = !live; $('startRow').hidden = !!live;
    $('addSearch').value = '';
    renderAvatars(); renderStart(); renderPl(); renderAdd();
    showSheet('hostSheet', live ? 'hostName' : null);
  }
  function renderAvatars() {
    var box = $('avatarGrid'); box.textContent = '';
    LV.AVATARS.forEach(function (a, i) {
      var b = el('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(i === H.avatar)); b.setAttribute('aria-label', a.label); b.tabIndex = i === H.avatar ? 0 : -1;
      b.append(LV.avatarNode(i));
      b.addEventListener('click', function () { H.avatar = i; renderAvatars(); box.children[i].focus(); });
      b.addEventListener('keydown', function (e) {
        var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
        e.preventDefault(); H.avatar = (i + d + LV.AVATARS.length) % LV.AVATARS.length; renderAvatars(); box.children[H.avatar].focus();
      });
      box.append(b);
    });
  }
  function renderStart() {
    var box = $('startSeg'); box.textContent = '';
    START_AT.forEach(function (o) { var b = el('button', null, o[0]); b.type = 'button'; b.setAttribute('aria-pressed', String(H.start === o[1])); b.addEventListener('click', function () { H.start = o[1]; renderStart(); }); box.append(b); });
  }
  function playingIndex() { if (!H.editing) return -1; var a = LV.at(H.editing, lengthOf, nowSec()); return a.state === 'on' ? H.songs.indexOf(H.editing.songs[a.index]) : -1; }
  function renderPl(focus) {
    var ol = $('plList'); ol.textContent = '';
    var cur = playingIndex(), total = 0;
    H.songs.forEach(function (id, i) {
      var s = songById[id]; if (!s) return; total += s.durationSeconds || 180;
      var li = el('li'); if (i === cur) li.className = 'now';
      var t = el('span', 'pl-t'); t.append(el('strong', null, s.title), el('span', null, (i === cur ? 'Playing now · ' : '') + s.artist + (s.durationSeconds ? ' · ' + fmt(s.durationSeconds) : '')));
      var bx = el('span', 'pl-b');
      function btn(cls, label, icon, fn, off) { var b = el('button', cls); b.type = 'button'; b.setAttribute('aria-label', label + ': ' + s.title); if (icon) b.innerHTML = '<svg aria-hidden="true"><use href="#' + icon + '"/></svg>'; else b.textContent = label; b.disabled = !!off; b.dataset.id = id; b.addEventListener('click', fn); bx.append(b); return b; }
      if (cur >= 0 && i !== cur && i !== (cur + 1) % H.songs.length) btn('next-btn', 'Play next', null, function () { move(id, cur < i ? cur + 1 : cur, 'next-btn'); });
      btn('up', 'Move up', 'i-up', function () { move(id, i - 1, 'up'); }, i === 0);
      btn('down', 'Move down', 'i-up', function () { move(id, i + 1, 'down'); }, i === H.songs.length - 1);
      btn('rm', 'Remove', 'i-close', function () { H.songs.splice(H.songs.indexOf(id), 1); renderPl(); renderAdd(); var n = $('plList').querySelector('.rm') || $('addSearch'); n.focus(); });
      li.append(t, bx); ol.append(li);
    });
    $('plEmpty').hidden = H.songs.length > 0;
    $('plSum').textContent = H.songs.length ? H.songs.length + (H.songs.length === 1 ? ' song · ' : ' songs · ') + Math.round(total / 60) + ' min' : '';
    checkGo();
    if (focus) { var f = ol.querySelector('button.' + focus.cls + '[data-id="' + focus.id + '"]:not(:disabled)') || ol.querySelector('button[data-id="' + focus.id + '"]'); if (f) f.focus(); }
  }
  function move(id, to, cls) { var i = H.songs.indexOf(id); H.songs.splice(i, 1); H.songs.splice(Math.max(0, Math.min(H.songs.length, to)), 0, id); renderPl({ id: id, cls: cls }); }
  function renderAdd() {
    var chips = $('addChips');
    if (!chips.children.length) [{ id: 'all', name: 'All' }].concat(S.genres).forEach(function (g) {
      var b = el('button', null, g.name); b.type = 'button'; b.dataset.genre = g.id;
      b.addEventListener('click', function () { H.chip = g.id; renderAdd(); });
      chips.append(b);
    });
    chips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.genre === H.chip)); });
    var q = $('addSearch').value.trim().toLowerCase(), ul = $('addRows'); ul.textContent = '';
    var list = S.data.songs.filter(function (s) { return s.playable && (H.chip === 'all' || s.genre === H.chip) && (!q || (s.title + ' ' + s.artist).toLowerCase().indexOf(q) !== -1); }).slice(0, 60);
    if (!list.length) ul.append(el('li', 'empty', q ? 'No playable songs match "' + $('addSearch').value.trim() + '".' : 'No playable songs in this genre yet.'));
    list.forEach(function (s) {
      var li = el('li'), b = el('button', 'row'), added = H.songs.indexOf(s.id) >= 0; b.type = 'button'; b.dataset.id = s.id;
      b.setAttribute('aria-pressed', String(added));
      var tag = el('span', 'add'); tag.innerHTML = added ? '' : '<svg aria-hidden="true"><use href="#i-plus"/></svg>'; tag.append(added ? 'Added' : 'Add');
      b.append(el('strong', null, s.title), tag, el('span', null, s.artist + (s.durationSeconds ? ' · ' + fmt(s.durationSeconds) : '')));
      b.addEventListener('click', function () {
        var k = H.songs.indexOf(s.id);
        if (k >= 0) H.songs.splice(k, 1);
        else if (H.songs.length >= LV.MAX_SONGS) { toast('A live can hold ' + LV.MAX_SONGS + ' songs.'); return; }
        else H.songs.push(s.id);
        renderPl(); renderAdd(); var again = $('addRows').querySelector('[data-id="' + s.id + '"]'); if (again) again.focus();
      });
      li.append(b); ul.append(li);
    });
  }
  function checkGo() { $('hostGo').disabled = !LV.cleanName($('hostName').value) || !H.songs.length; }
  $('hostName').addEventListener('input', checkGo);
  $('addSearch').addEventListener('input', renderAdd);
  $('hostGo').addEventListener('click', function () {
    var name = LV.cleanName($('hostName').value); if (!name || !H.songs.length) return;
    try { localStorage.setItem('garbo-proto-host', JSON.stringify({ name: name, avatar: H.avatar })); } catch (e) { /* storage unavailable */ }
    var live, fresh = !H.editing;
    var ltitle = LV.cleanTitle($('hostTitleIn').value);
    if (H.editing) { live = LV.reanchor(H.editing, H.songs, nowSec(), lengthOf); live.host = name; live.avatar = H.avatar; live.title = ltitle; }
    else live = { id: LV.newId(), host: name, title: ltitle, avatar: H.avatar, start: Math.floor(nowSec()) + H.start * 60, songs: H.songs.slice() };
    LV.remember(lives, 'mine', live);
    if (fresh || (S.hosted && S.hosted.live.id === live.id)) tuneIn(live, fresh ? live.start <= nowSec() : isActive());
    showLink(live, fresh);
  });
  $('hostEnd').addEventListener('click', function () {
    var live = H.editing; if (!live) return;
    lives.mine = lives.mine.filter(function (x) { return x.id !== live.id; }); LV.save(lives);
    if (S.hosted && S.hosted.live.id === live.id) { S.hosted = null; setGenre(S.genre === 'nonstop' ? 'traditional' : S.genre, false); }
    closeSheet(); toast('Removed from your lives. Anyone who has the link can still listen.');
  });

  /* Link sheet */
  function showLink(live, fresh) {
    var a = LV.at(live, lengthOf, nowSec()), first = songById[live.songs[a.state === 'on' ? a.index : 0]];
    $('linkTitle').textContent = a.state === 'upcoming' ? 'Your live starts at ' + clockTime(live.start) : fresh ? 'Your live is on' : 'Your live';
    var host = $('linkHost'); host.textContent = ''; host.append(LV.avatarNode(live.avatar), el('span', null, LV.title(live)));
    $('linkLead').textContent = (a.state === 'upcoming' ? 'Opens with ' : 'Now playing: ') + (first ? first.title : '') + '. ' + live.songs.length + (live.songs.length === 1 ? ' song' : ' songs') + ' in the playlist.';
    $('linkField').value = liveUrl(live);
    showSheet('linkSheet', 'linkShare');
  }
  $('linkField').addEventListener('focus', function () { this.select(); });
  $('linkCopy').addEventListener('click', function () {
    var v = $('linkField').value;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(function () { toast('Link copied'); }, function () { $('linkField').select(); toast('Select the link and copy it.'); });
    else { $('linkField').select(); toast('Select the link and copy it.'); }
  });
  $('linkShare').addEventListener('click', function () {
    var v = $('linkField').value;
    if (navigator.share) navigator.share({ title: $('linkHost').textContent + ' on PlayGarba', url: v }).catch(function () { /* cancelled */ });
    else $('linkCopy').click();
  });
  $('stationRow').addEventListener('click', function () { closeSheet(); if (!S.live) toggleLive(); });
  $('hostNew').addEventListener('click', function () { openHost(null); });


  /* ---------- cards from the rail ----------
     View, venue, sound and ideas open as small cards at the side. There's no dimmed backdrop, so the player
     keeps going around them; a tap elsewhere or Escape puts them away. */
  var openCardId = null;
  function openCard(id) {
    if (openCardId === id) { closeCard(); return; }
    closeCard(true);
    if (openSheet) closeSheet(true);
    var c = $(id); c.hidden = false; openCardId = id;
    document.querySelectorAll('.rail-btn').forEach(function (b) { b.setAttribute('aria-expanded', String(b.dataset.card === id)); });
    if (id === 'linkCard') {
      $('linkSongBtn')?.setAttribute('aria-expanded', 'true');
      var s = $('linkSongStatus'); if (s) { s.style.display = 'none'; s.textContent = ''; }
      setTimeout(function () { $('linkSongInput')?.focus(); }, 30);
    }
    if (id === 'ideaCard') loadScript('ideas.js').catch(function () { $('ideaNote').textContent = "The idea box couldn't load. Check your connection."; });
    setTimeout(function () { var f = c.querySelector('[aria-pressed="true"], textarea, button:not([data-card-close])'); (f || c).focus(); }, 30);
  }
  function closeCard(silent) {
    if (!openCardId) return;
    var id = openCardId; $(id).hidden = true; openCardId = null;
    var btn = document.querySelector('.rail-btn[data-card="' + id + '"]') || (id === 'linkCard' ? $('linkSongBtn') : null);
    if (btn) { btn.setAttribute('aria-expanded', 'false'); if (!silent) btn.focus(); }
  }
  document.querySelectorAll('.rail-btn').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); openCard(b.dataset.card); }); });
  $('linkSongBtn')?.addEventListener('click', function (e) { e.stopPropagation(); openCard('linkCard'); });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-card-close]')) { closeCard(); return; }
    if (openCardId && !e.target.closest('.side-card') && !e.target.closest('.rail') && e.target !== $('linkSongBtn') && !$('linkSongBtn')?.contains(e.target)) closeCard(true);
  });

  function parseYtId(val) {
    var text = String(val || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
    var m = text.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  // A playlist in a YouTube link (list=), by the same rules as the player: YouTube's own Mixes, Liked and Watch
  // later lists are personal or endless, so they don't count
  function parseYtList(val) {
    var m = String(val || '').match(/[?&]list=([A-Za-z0-9_-]{10,64})(?:[&#]|$)/);
    return m && /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(val) && !/^(RD|UL|LL|WL)/.test(m[1]) ? m[1] : null;
  }

  function submitLinkSong() {
    var input = $('linkSongInput');
    var val = (input ? input.value : '').trim();
    var vid = parseYtId(val), list = parseYtList(val);
    var status = $('linkSongStatus');
    // The live player plays a whole playlist in order; this standalone prototype plays single videos only
    if (list && LIVE_SITE) vid = vid || list;
    if (!vid) {
      if (status) {
        status.textContent = list ? 'Playlists play on the live PlayGarba site. Paste a link to one video here.' : 'Please enter a valid YouTube video or playlist link, or a video ID.';
        status.style.display = 'block';
      }
      return;
    }
    if (status) {
      status.style.display = 'none';
      status.textContent = '';
    }
    if (LIVE_SITE) {
      requestLiveAction('play-youtube', val);
      closeCard();
      return;
    }
    var existing = S.data && Array.isArray(S.data.songs) ? S.data.songs.find(function (s) { return s.videoId === vid; }) : null;
    if (existing) {
      loadSong(existing, true);
    } else {
      var customSong = {
        id: 'yt-' + vid,
        title: 'YouTube Track',
        artist: 'Custom track',
        genre: S.genre || 'traditional',
        videoId: vid,
        playable: true,
        durationSeconds: 0
      };
      loadSong(customSong, true);
    }
    closeCard();
  }
  $('linkSongGo')?.addEventListener('click', submitLinkSong);
  $('linkSongInput')?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitLinkSong();
    }
  });

  /* Ideas: the words go to the project exactly as written */
  $('ideaText').addEventListener('input', function () { $('ideaSend').disabled = !this.value.trim(); });
  $('ideaSend').addEventListener('click', function () {
    var text = $('ideaText').value, name = $('ideaName').value.trim(), btn = this;
    if (!text.trim() || !window.GarboIdeas) return;
    btn.disabled = true; $('ideaNote').textContent = 'Sending…';
    window.GarboIdeas.send(text, name).then(function (r) {
      if (r.how === 'sent') { $('ideaText').value = ''; $('ideaNote').textContent = 'Thank you. Your idea is with the PlayGarba team.'; }
      else { btn.disabled = false; $('ideaNote').textContent = 'GitHub opens in a new tab with your idea filled in. Press Submit there to send it. If no tab opened, allow pop-ups for this page.'; }
    }, function () { btn.disabled = false; $('ideaNote').textContent = "That didn't send. Try again in a moment."; });
  });

  /* ---------- the DJ ----------
     Looking for songs walks you over to the DJ's table. Explore opens as his laptop, turned towards you in the
     corner, while he sips his chhas. Closing it walks you back to where you were. */
  var djTimer = 0;
  function djSay(gu, en) { scene.atmosphere({ djSay: gu }); $('djSr').textContent = en; }
  function djMode(on) {
    if (!VENUE_SCENE || !scene.atmosphere) return;
    clearTimeout(djTimer);
    document.documentElement.classList.toggle('dj-mode', on);
    scene.dj = on; scene.atmosphere({ dj: on, djSay: '' });
    relayout();
    // He looks up as you arrive: "What do you want?"
    if (on) djTimer = setTimeout(function () { djSay('શું જોઈએ?', 'The DJ asks what you would like to hear.'); }, reducedQuery.matches ? 0 : 1100);
  }
  // Picking a song: the laptop closes, he says "It'll be done!", and you walk back as it starts
  function djPick(start) {
    if (!document.documentElement.classList.contains('dj-mode')) { closeSheet(); start(); return; }
    closeSheet(false, true);
    clearTimeout(djTimer); djSay('થઈ જશે!', "The DJ says it'll be done.");
    djTimer = setTimeout(function () { djMode(false); start(); }, reducedQuery.matches ? 300 : 1500);
  }

  /* ---------- sheets ---------- */
  var openSheet = null, opener = null;
  function focusables(root) { return Array.prototype.filter.call(root.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'), function (n) { return !n.disabled && n.offsetParent !== null; }); }
  function showSheet(id, focusId) {
    if (openSheet) closeSheet(true);
    opener = document.activeElement;
    var s = $(id); s.hidden = false; openSheet = s;
    if (id !== 'aboutPage') $('scrim').hidden = false;
    $('scrim').classList.toggle('light', id === 'exploreSheet' && VENUE_SCENE);
    closeCard(true);
    app.inert = true;
    var target = focusId ? $(focusId) : s;
    setTimeout(function () { if (target) target.focus(); }, 30);
    if (id === 'exploreSheet') { syncDecksPane(); decksKey = ''; mirrors.resize(); renderRows(); djMode(true); }
    if (id === 'tonightSheet') renderTonightMarks();
    if (id === 'shareSheet') drawShare();
    if (id === 'livesSheet') renderLives();
    if (id === 'videoSheet') syncVideoDock();
  }
  // On a wide laptop Up next sits beside the list, so it needs no tab of its own
  var wideQuery = window.matchMedia('(min-width: 900px) and (min-height: 560px)');
  function wideDecks() { return VENUE_SCENE && wideQuery.matches; }
  // The decks show beside the list on a wide laptop, and otherwise only on their own tab
  function syncDecksPane() {
    var onTab = $('tabQueue').getAttribute('aria-selected') === 'true';
    if (wideDecks() && onTab) { selectTab(0); return; }
    $('panelQueue').hidden = !(onTab || wideDecks());
  }
  if (wideQuery.addEventListener) wideQuery.addEventListener('change', function () { if (openSheet && openSheet.id === 'exploreSheet') syncDecksPane(); });
  function closeSheet(silent, keepDj) {
    if (!openSheet) return;
    if (openSheet.id === 'exploreSheet' && !keepDj) djMode(false);
    openSheet.hidden = true; openSheet = null;
    $('scrim').hidden = true; app.inert = false;
    syncVideoDock();
    if (!silent && opener && opener.focus) opener.focus();
  }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheet(); });
  $('scrim').addEventListener('click', function () { closeSheet(); });
  document.addEventListener('keydown', function (e) {
    if (LIVE_SITE && e.key === 'Escape' && !openCardId && !openSheet) {
      e.preventDefault();
      window.parent.postMessage({ channel: LIVE_CHANNEL, type: 'exit' }, location.origin);
      return;
    }
    if (openCardId && !openSheet && e.key === 'Escape') { e.preventDefault(); closeCard(); return; }
    if (openSheet) {
      if (e.key === 'Escape') {
        if (e.target === $('searchInput') && $('searchInput').value) { $('searchInput').value = ''; renderRows(); return; }
        e.preventDefault(); closeSheet(); return;
      }
      if (e.key === 'Tab') {
        var f = focusables(openSheet); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.target.matches('input')) return;
    if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); toggle(); }
    if (e.key === '/') { e.preventDefault(); showSheet('exploreSheet', 'searchInput'); }
  });

  /* Explore */
  var chipGenre = 'all';
  var songBatchSize = 160, setBatchSize = 80;
  var visibleSongCount = songBatchSize, visibleSetCount = setBatchSize;
  function appendMoreRow(list, kind, shown, total, loadMore) {
    if (shown >= total) return;
    var li = el('li'), button = el('button', 'row more-row');
    var remaining = total - shown;
    button.type = 'button';
    button.textContent = 'Show more ' + kind + ' (' + Math.min(remaining, kind === 'songs' ? songBatchSize : setBatchSize) + ')';
    button.setAttribute('aria-label', 'Show more ' + kind);
    button.addEventListener('click', loadMore);
    li.append(button); list.append(li);
  }
  function buildChips() {
    var chips = $('genreChips');
    [{ id: 'all', name: 'All' }].concat(S.genres).forEach(function (g) {
      var b = el('button', null, g.name); b.type = 'button'; b.dataset.genre = g.id; b.setAttribute('aria-pressed', String(g.id === 'all'));
      b.addEventListener('click', function () { chipGenre = g.id; visibleSongCount = songBatchSize; chips.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderRows(); });
      chips.append(b);
    });
  }
  function playNow(s) {
    exitSpecial();
    S.genre = s.genre; renderDial();
    S.queue = playableIn(s.genre); S.index = Math.max(0, S.queue.indexOf(s));
    djPick(function () { loadSong(s, s.playable); if (!s.playable) toast('This recording is not available yet.'); });
  }
  /* Up next at the DJ's table: play a song next, add it to the end, or take it off again. Live Radio, a Garba
     Circle and a hosted live follow their own running order, so there's no list of your own to add to then. */
  function canQueue() { return LIVE_SITE ? LIVE_STATE_READY && !S.live && !S.circle : !S.live && !S.hosted && !S.tonight; }
  function queueButton(kind, s) {
    var b = el('button', 'ra'); b.type = 'button';
    var label = kind === 'next' ? 'Play ' + s.title + ' next' : 'Add ' + s.title + ' to Up next';
    b.setAttribute('aria-label', label); b.title = kind === 'next' ? 'Play next' : 'Add to Up next';
    b.innerHTML = '<svg aria-hidden="true"><use href="#' + (kind === 'next' ? 'i-next' : 'i-plus') + '"/></svg>';
    b.addEventListener('click', function () { askDj(kind, s, b); });
    return b;
  }
  function askDj(kind, s, b) {
    if (LIVE_SITE) requestLiveAction(kind === 'next' ? 'queue-next' : 'queue-add', s.id);
    else {
      S.upNext = S.upNext.filter(function (x) { return x.id !== s.id; });
      if (kind === 'next') S.upNext.unshift(s); else S.upNext.push(s);
      S.upNext = S.upNext.slice(0, 30);
    }
    clearTimeout(djTimer);
    // "Right after this one!" or "Noted!"
    if (kind === 'next') djSay('આના પછી આ જ!', 'The DJ will play ' + s.title + ' next.');
    else djSay('લખી લીધું!', 'The DJ added ' + s.title + ' to Up next.');
    if (b) { b.classList.add('done'); setTimeout(function () { b.classList.remove('done'); }, 1200); }
    renderDecks();
  }
  function unqueue(id) {
    if (LIVE_SITE) requestLiveAction('queue-remove', id);
    else S.upNext = S.upNext.filter(function (x) { return x.id !== id; });
    renderDecks();
  }
  // What plays after this song: the songs you asked for, then how the night carries on
  function upNextList() {
    if (LIVE_SITE) return (S.liveUpNext || []).map(function (u) { return { song: songById[u.id] || u, queued: !!u.queued }; });
    var out = S.upNext.map(function (x) { return { song: x, queued: true }; }), seen = {};
    S.upNext.forEach(function (x) { seen[x.id] = 1; });
    if (S.track && S.track.song) seen[S.track.song.id] = 1;
    for (var i = 1; out.length < 10 && S.queue.length && i <= S.queue.length; i++) {
      var q0 = S.queue[(S.index + i) % S.queue.length];
      if (q0 && !seen[q0.id]) { seen[q0.id] = 1; out.push({ song: q0, queued: false }); }
    }
    return out;
  }
  var decksKey = '';
  function renderDecks() {
    if (!$('panelQueue')) return;
    var v = S.track ? trackView() : null, list = S.live || S.hosted || S.tonight ? [] : upNextList();
    var queued = list.filter(function (x) { return x.queued; }).length;
    var key = (v ? v.title + '|' + v.artist : '') + '|' + S.live + S.circle + !!S.hosted + !!S.tonight + '|' + list.map(function (x) { return x.song.id + (x.queued ? '+' : ''); }).join(',');
    $('queueCount').textContent = queued ? ' · ' + queued : '';
    if (key === decksKey) return;
    decksKey = key;
    var now = $('deckNow'); now.textContent = '';
    if (v) { now.append(el('strong', null, v.title), el('span', null, v.artist || '')); }
    else now.append(el('span', null, 'Nothing is playing yet.'));
    var ol = $('upNextRows'); ol.textContent = '';
    var note = $('decksNote');
    if (S.live || S.hosted || S.tonight) {
      note.textContent = S.live ? 'Live Radio plays its own running order.' : S.hosted ? 'The host picks what plays next.' : 'Tonight plays its own running order.';
      return;
    }
    var gap = false;
    list.forEach(function (x) {
      var s = x.song;
      if (!x.queued && queued && !gap) { gap = true; ol.append(el('li', 'decks-then', 'Then')); }
      var li = el('li', x.queued ? 'is-queued' : null), b = el('button', 'row'); b.type = 'button';
      b.append(el('strong', null, s.title), el('span', null, s.artist || ''));
      b.addEventListener('click', function () { var full = songById[s.id] || s; if (full.genre) playNow(full); else requestLiveAction('song', s.id); });
      li.append(b);
      if (x.queued) {
        var rm = el('button', 'ra'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + s.title + ' from Up next'); rm.title = 'Remove';
        rm.innerHTML = '<svg aria-hidden="true"><use href="#i-close"/></svg>';
        rm.addEventListener('click', function () { unqueue(s.id); });
        li.append(rm);
      }
      ol.append(li);
    });
    note.textContent = S.circle ? 'The Garba Circle follows its host.' : queued ? '' : canQueue() ? 'Use + on a song to add it here, or ⏭ to play it next.' : '';
  }
  function renderRows(preserveScroll) {
    var sheetBody = $('exploreSheet').querySelector('.sheet-body');
    var previousScrollTop = sheetBody ? sheetBody.scrollTop : 0;
    var q = $('searchInput').value.trim().toLowerCase();
    var ul = $('songRows'); ul.textContent = '';
    var seenChapterVideos = new Set();
    var matches = S.data.songs.filter(function (s) {
      if (chipGenre !== 'all' && s.genre !== chipGenre) return false;
      if (!q) {
        // When browsing without search: show one representative song per chaptered set
        if (s.videoId && s.isChapter) {
          if (seenChapterVideos.has(s.videoId)) return false;
          seenChapterVideos.add(s.videoId);
        }
        return true;
      }
      return (s.title + ' ' + s.artist + ' ' + (s.release ? s.release.title : '')).toLowerCase().indexOf(q) !== -1;
    });
    var songs = matches.slice(0, visibleSongCount);
    var count = $('exploreCount');
    var showingNonstop = !$('panelNonstop').hidden;
    var setQuery = q;
    var setMatches = S.data.nonstopSets.filter(function (set) {
      return !setQuery || (set.title + ' ' + set.artists.join(' ')).toLowerCase().indexOf(setQuery) !== -1;
    });
    var visibleSets = setMatches.slice(0, visibleSetCount);
    if (count) {
      if (showingNonstop && S.nonstopSetsStatus === 'loading') count.textContent = 'Loading verified Nonstop sets…';
      else if (showingNonstop && S.nonstopSetsStatus === 'error') count.textContent = 'Nonstop sets could not load. Check your connection.';
      else if (showingNonstop) count.textContent = setMatches.length > visibleSets.length
        ? 'Showing ' + visibleSets.length + ' of ' + setMatches.length + ' Nonstop sets.'
        : setMatches.length + (setMatches.length === 1 ? ' Nonstop set' : ' Nonstop sets');
      else count.textContent = matches.length > songs.length
        ? 'Showing ' + songs.length + ' of ' + matches.length + ' songs · search to narrow the list.'
        : matches.length + (matches.length === 1 ? ' song' : ' songs');
    }
    if (!songs.length) {
      var g = genreInfo(chipGenre);
      ul.append(el('li', 'empty', q ? 'No songs match "' + $('searchInput').value.trim() + '".' : 'No ' + (g ? g.name : '') + ' songs are listed yet.'));
    }
    songs.forEach(function (s) {
      var li = el('li'), b = el('button', 'row'); b.type = 'button'; b.dataset.id = s.id;
      b.append(el('strong', null, s.title), el('span', 'dur', s.durationSeconds ? fmt(s.durationSeconds) : ''));
      var meta = el('span', null, s.artist);
      b.append(meta);
      if (!s.playable) { b.setAttribute('aria-disabled', 'true'); b.append(el('span', 'badge na', 'Not playable yet')); }
      b.addEventListener('click', function () { playNow(s); });
      li.append(b);
      if (s.playable && canQueue()) {
        li.className = 'queueable';
        var acts = el('span', 'row-acts');
        acts.append(queueButton('next', s), queueButton('add', s));
        li.append(acts);
      }
      ul.append(li);
    });
    appendMoreRow(ul, 'songs', songs.length, matches.length, function () {
      visibleSongCount += songBatchSize; renderRows(true);
      var next = $('songRows').querySelector('.more-row');
      if (next) next.focus({ preventScroll: true });
      else $('songRows').lastElementChild?.querySelector('button')?.focus({ preventScroll: true });
    });
    var sets = $('setRows'); sets.textContent = '';
    if (!setMatches.length) {
      var message = S.nonstopSetsStatus === 'loading' ? 'Loading verified Nonstop sets…'
        : S.nonstopSetsStatus === 'error' ? 'Nonstop sets could not load. Check your connection.'
          : q ? 'No Nonstop sets match "' + $('searchInput').value.trim() + '".' : 'No verified Nonstop sets are available right now.';
      sets.append(el('li', 'empty', message));
    }
    visibleSets.forEach(function (set) {
      var li = el('li'), b = el('button', 'row'); b.type = 'button';
      b.append(el('strong', null, set.title), el('span', 'dur', set.durationSeconds ? fmt(set.durationSeconds) : ''), el('span', null, set.artists.join(', ') + ' · ' + set.chapters.length + ' chapters'));
      b.addEventListener('click', function () { exitSpecial(); S.genre = 'nonstop'; renderDial(); djPick(function () { loadSet(set, 0, true); }); });
      li.append(b); sets.append(li);
    });
    appendMoreRow(sets, 'Nonstop sets', visibleSets.length, setMatches.length, function () {
      visibleSetCount += setBatchSize; renderRows(true);
      var next = $('setRows').querySelector('.more-row');
      if (next) next.focus({ preventScroll: true });
      else $('setRows').lastElementChild?.querySelector('button')?.focus({ preventScroll: true });
    });
    if (preserveScroll && sheetBody) sheetBody.scrollTop = previousScrollTop;
    markCurrentRows();
  }
  function markCurrentRows() {
    var id = S.track && S.track.song ? S.track.song.id : null;
    document.querySelectorAll('#songRows .row').forEach(function (r) { r.classList.toggle('is-current', r.dataset.id === id); });
    if (openSheet && openSheet.id === 'exploreSheet') renderDecks();
  }
  function buildSteps() {
    var ul = $('stepRows');
    STEPS.forEach(function (st) {
      var li = el('li', 'step');
      li.append(el('strong', null, st.name), el('span', null, st.desc), el('span', null, 'No songs tagged yet'));
      if (st.claps) {
        var c = el('span', 'claps'); c.setAttribute('role', 'img'); c.setAttribute('aria-label', st.claps + ' claps');
        for (var i = 0; i < 4; i++) { var d = el('i'); if (i < st.claps) d.className = 'c'; c.append(d); }
        li.append(c);
      }
      ul.append(li);
    });
  }
  var tabs = ['tabSongs', 'tabNonstop', 'tabSteps', 'tabQueue'];
  tabs.forEach(function (id, i) {
    $(id).addEventListener('click', function () { selectTab(i); });
    $(id).addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); var n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectTab(n); $(tabs[n]).focus(); }
    });
  });
  function selectTab(n) {
    tabs.forEach(function (id, i) {
      var on = i === n; $(id).setAttribute('aria-selected', String(on)); $(id).tabIndex = on ? 0 : -1;
      $($(id).getAttribute('aria-controls')).hidden = !on;
    });
    $('exploreSheet').classList.toggle('on-queue', n === 3);
    if (n !== 3 && wideDecks()) $('panelQueue').hidden = false;
    if (S.data) renderRows();
  }
  $('searchInput').addEventListener('input', function () {
    visibleSongCount = songBatchSize; visibleSetCount = setBatchSize;
    // Typing on the Up next tab goes back to the songs, where the results are
    if ($('tabQueue').getAttribute('aria-selected') === 'true') { selectTab(0); return; }
    renderRows();
  });

  /* Share */
  function drawShare() {
    var v = trackView();
    window.GarboScene.drawCard($('shareCard'), { eyebrow: v.eyebrow, title: v.title, artist: v.artist });
  }
  $('shareGo').addEventListener('click', function () {
    var canvas = $('shareCard');
    if (!navigator.canShare || !canvas.toBlob) { toast("Sharing isn't available in this browser."); return; }
    canvas.toBlob(function (blob) {
      var file = new File([blob], 'playgarba.png', { type: 'image/png' });
      if (!navigator.canShare({ files: [file] })) { toast("Sharing isn't available in this browser."); return; }
      navigator.share({ files: [file], title: trackView().title }).catch(function () { /* cancelled */ });
    });
  });

  /* ---------- prototype states ---------- */
  function findLong() { var s = S.data.songs.filter(function (x) { return x.playable; }); s.sort(function (a, b) { return b.title.length - a.title.length; }); return s[0]; }
  var STATES = [
    { id: 'ember', name: 'Paused', desc: 'Ember glow, waiting', run: function () { exitSpecial(); setGenre('traditional', false); } },
    { id: 'loading', name: 'Loading', desc: 'Lamp catching', run: function () { exitSpecial(); setGenre('traditional', false); setMode('loading'); } },
    { id: 'playing', name: 'Playing', desc: 'Lit, dancers moving', run: function () { exitSpecial(); setGenre('traditional', false); S.pos = 40; setMode('playing'); } },
    { id: 'nonstop', name: 'Nonstop set', desc: 'Chapters on the circle', run: function () { exitSpecial(); S.genre = 'nonstop'; renderDial(); loadSet(S.data.nonstopSets[1] || S.data.nonstopSets[0], 4, false); setMode('playing'); } },
    { id: 'live', name: '24/7 Live', desc: 'No seeking, always on', run: function () { if (!S.live) toggleLive(); setMode('live'); } },
    { id: 'long', name: 'Long title', desc: 'Two-line limit', run: function () { exitSpecial(); var s = findLong(); S.genre = s.genre; renderDial(); S.queue = playableIn(s.genre); S.index = S.queue.indexOf(s); loadSong(s, false); } },
    { id: 'unavailable', name: 'Not playable yet', desc: 'Gujarati release, no route', run: function () { exitSpecial(); var s = S.data.songs.filter(function (x) { return !x.playable; })[0]; if (s) { S.genre = s.genre; renderDial(); loadSong(s, false); } } },
    { id: 'offline', name: 'Offline', desc: 'Lamp goes dark', run: function () { goOffline(true); } },
    { id: 'empty', name: 'Empty genre', desc: 'Sanedo has no routes', run: function () { exitSpecial(); setGenre('sanedo', false); } },
    { id: 'tonight', name: 'Tonight', desc: 'Night in five parts', run: function () { startTonightPart(1, false); setMode('playing'); } },
    { id: 'hosted', name: 'Hosted live', desc: "In someone's live", run: function () { needLives().then(function () { var ids = S.data.songs.filter(function (x) { return x.playable; }).slice(3, 9).map(function (x) { return x.id; }); var live = { id: 'demo1', host: 'Priya', avatar: 5, start: Math.floor(nowSec()) - 70, songs: ids }; LV.remember(lives, 'joined', live); tuneIn(live, true); }); } }
  ];
  function buildStates() {
    var grid = $('stateGrid');
    STATES.forEach(function (st) {
      var b = el('button'); b.type = 'button'; b.append(st.name, el('span', null, st.desc));
      b.addEventListener('click', function () { closeSheet(true); if (S.offline && st.id !== 'offline') goOffline(false); st.run(); });
      grid.append(b);
    });
  }
  function goOffline(on) {
    if (on === S.offline) return;
    S.offline = on;
    if (on) { S.resumeMode = isActive() ? 'playing' : S.mode; clearTimeout(S.loadTimer); setMode('offline'); }
    else { if (S.resumeMode === 'playing') play(); else setMode(S.resumeMode === 'offline' ? 'ember' : S.resumeMode); toast("You're back online."); }
  }
  window.addEventListener('offline', function () { goOffline(true); });
  window.addEventListener('online', function () { goOffline(false); });

  /* ---------- wiring ---------- */
  $('playBtn').addEventListener('click', toggle);
  $('lampHit').addEventListener('click', toggle);
  $('prevBtn').addEventListener('click', function () {
    if (requestLiveAction('previous')) return;
    if (S.pos > 5 && S.track && S.track.kind === 'song') { S.pos = 0; renderTime(); } else step(-1);
  });
  $('nextBtn').addEventListener('click', function () { step(1); });
  $('shuffleBtn').addEventListener('click', function () { if (requestLiveAction('shuffle')) return; S.shuffle = !S.shuffle; this.setAttribute('aria-pressed', String(S.shuffle)); toast(S.shuffle ? 'Shuffle on' : 'Shuffle off'); });
  $('heartBtn').addEventListener('click', function () {
    if (requestLiveAction('favourite')) return;
    if (!S.track || !S.track.song) { toast('Only songs can be saved in this prototype.'); return; }
    var id = S.track.song.id, on = !S.saved.has(id);
    if (on) S.saved.add(id); else S.saved.delete(id);
    try { localStorage.setItem('garbo-proto-saved', JSON.stringify(Array.from(S.saved))); } catch (e) { /* storage unavailable */ }
    this.setAttribute('aria-pressed', String(on));
    toast(on ? 'Saved to My Garba' : 'Removed from My Garba');
  });
  $('ringSeek').addEventListener('input', function () {
    if (requestLiveAction('seek', this.value / 1000)) return;
    var f = this.value / 1000, t = S.track;
    if (!t || S.live) return;
    if (t.kind === 'chapter') {
      var set = t.set, n = set.chapters.length;
      var c = set.durationSeconds ? set.chapters.reduce(function (acc, ch, i) { return ch.startSeconds <= f * set.durationSeconds ? i : acc; }, 0) : Math.min(n - 1, Math.floor(f * n));
      if (c !== t.chapterIndex) { t.chapterIndex = c; t.title = set.chapters[c].title; scene.set({ chapterIndex: c }); renderNP(false); }
      S.pos = set.durationSeconds ? f * set.durationSeconds : set.chapters[c].startSeconds;
    } else {
      var d = duration(); if (!d) return; S.pos = f * d;
    }
    if (!LIVE_SITE) ytSeekTo(S.pos);
    renderTime();
  });
  $('liveBtn').addEventListener('click', function () { if (S.hosted) showSheet('livesSheet', 'hostNew'); else toggleLive(); });
  $('circleBridge')?.addEventListener('click', function () {
    if (requestLiveAction('circle')) return;
    var isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    window.location.href = isLocalDev ? '/#circle' : '../../../../#circle';
  });
  $('searchBtn').addEventListener('click', function () { showSheet('exploreSheet', 'searchInput'); });
  $('exploreBtn').addEventListener('click', function () { showSheet('exploreSheet'); });
  $('tonightBtn').addEventListener('click', function () { showSheet('tonightSheet'); });
  $('moreBtn').addEventListener('click', function () { showSheet('moreSheet'); });
  $('videoBtn').addEventListener('click', function () { showSheet('videoSheet'); });
  $('shareOpen').addEventListener('click', function () { showSheet('shareSheet'); });
  $('aboutOpen').addEventListener('click', function () { showSheet('aboutPage'); });
  $('installBtn').addEventListener('click', function () { toast('Your browser shows its install prompt here.'); });
  $('livesOpen').addEventListener('click', function () { needLives().then(function () { showSheet('livesSheet', 'hostNew'); }, function () { toast("Lives couldn't load. Check your connection."); }); });

  /* ---------- Singer faces ---------- */
  // Singer heads: cut-out portraits (face and hair on transparency) in singers/, listed by artist slug. `man` picks which
  // stage costume the head goes on. singers/roster.json records the reference photos each portrait was drawn from.
  // A page can replace the list with window.GARBO_SINGERS and the folder with window.GARBO_SINGER_BASE.
  var SINGER_HEADS = { women: ['alpa-patel', 'aishwarya-majmudar', 'bhoomi-trivedi', 'falguni-pathak', 'geeta-rabari', 'ishani-dave', 'jahnvi-shrimankar', 'kairavi-buch', 'kinjal-dave', 'purva-mantri', 'rutvi-pandya', 'sabhiben-ahir', 'santvani-trivedi', 'pamela-jain', 'kajal-maheriya', 'rashmita-rabari', 'himali-vora', 'pooja-kalyani', 'anita-pandit', 'dhara-shah', 'trupti-gadhvi', 'nisha-upadhyay', 'anushka-pandit', 'shruti-ahir', 'damayanti-bardai'], men: ['aditya-gadhvi', 'atul-purohit', 'jigardan-gadhavi', 'jignesh-barot', 'kirtidan-gadhvi', 'osman-mir', 'parth-bharat-thakkar', 'parth-oza', 'rajesh-ahir', 'umesh-barot', 'hemant-chauhan', 'maulik-mehta', 'gaman-santhal', 'praful-dave', 'hardik-dave', 'rahul-munjariya', 'tushaar-trivedi', 'dharmesh-barot', 'kishore-manraja', 'hariom-gadhavi', 'rushabh-ahir', 'parthiv-gohil', 'shailendra-bharti', 'vikram-thakor', 'musa-paik', 'kailash-kher', 'tejas-shishangiya', 'balraj-shastri', 'achal-maheta'] };
  var SINGER_BASE = window.GARBO_SINGER_BASE || 'singers/', SINGERS = window.GARBO_SINGERS || (function () {
    var out = {};
    SINGER_HEADS.women.forEach(function (id) { out[id] = { file: id + '.webp', man: false }; });
    SINGER_HEADS.men.forEach(function (id) { out[id] = { file: id + '.webp', man: true }; });
    return out;
  })();
  // Catalogue credits use both spellings for Kishor(e) Manraja; reuse the verified roster cutout.
  if (SINGERS && SINGERS['kishore-manraja']) SINGERS['kishor-manraja'] = SINGERS['kishore-manraja'];
  function slugify(t) { return String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  // Credits that aren't a singer on stage: various artists, traditional, choruses, producers and DJ credits
  var NOT_A_SINGER = /various|traditional|chorus|muzik|music|\bdj\b|sounds|orchestra|meghdhanush|tropical|\bedm\b/i;
  // Singers without a portrait: the first names common in the catalogue say which voice to dress; anyone else is
  // left for the scene to place
  var WOMEN_NAMES = 'geeta pamela aishwarya falguni rutvi kajal kinjal himali bhoomi rashmita santvani kairavi pooja anita dhara anushka alpa trupti shruti nisha rupal smita forum damayanti sonal dipali rekha abhita malini charmi apexa purva sargam shilpa pratiksha asha lalita priya ishani divya asees anuradha mina aarti veera poonam diwaliben madhubanti roopal goral sonam swati jigna kavya prakriti janhvi jahnvi dipti pragati rucha arohi archana neha shreya kavita dhvani sabhiben hemali alka'.split(' ');
  var MEN_NAMES = 'kirtidan hemant atul aditya maulik rahul gaman praful jigardan hardik tushaar osman dharmesh hariom rushabh parthiv shailendra umesh kishor kishore kailash vikram musa gaurang achal tejas balraj deepak sonu bandish sudesh sanjay manoj govind sajid ashish bappi piyush parth amit bhargav dipak darshan himanshu kushal kedar raj siddharth jaysinh aakash jignesh vinay raag ashit pankaj mayur birju manu gaurav achint smmit hemang abhay vijay nitin yash bhavin shyam rutvij devraj niren vishaldan janak shail dev narendra tanishk karsan vinod ansh sachin lijo'.split(' ');
  function voiceOf(name) { var first = String(name).trim().split(/\s+/)[0].toLowerCase(); return WOMEN_NAMES.indexOf(first) >= 0 ? false : MEN_NAMES.indexOf(first) >= 0 ? true : null; }

  /* ---------- Atmosphere sheet ---------- */
  function atmoSave() { try { localStorage.setItem('garbo-proto-atmosphere', JSON.stringify({ mode: A.mode, venue: A.venue, listener: A.listener, pattern: A.pattern, youAs: A.youAs })); } catch (e) { /* storage unavailable */ } }
  // Each choice gets its own icon; clap patterns show their beat as dots
  var SEG_ICONS = { circle: 'i-ring', far: 'i-chair', stage: 'i-mic', stadium: 'i-stadium', outdoors: 'i-tree', sheri: 'i-houses', claps: 'i-hands', dandiya: 'i-sticks', crowd: 'i-crowd', clapping: 'i-hands', immersive: 'i-full' };
  var SEG_DOTS = { beat: [1], 'be-tali': [0, 0, 1, 1], 'tran-tali': [0, 1, 1, 1] };
  function atmoSegment(elId, items, current, pick) {
    var box = $(elId); box.textContent = '';
    box.style.setProperty('--n', String(Object.keys(items).length));
    Object.keys(items).forEach(function (id) {
      var b = el('button'); b.type = 'button'; b.dataset.id = id;
      if (SEG_ICONS[id]) { var ic = el('span', 'seg-ic'); ic.setAttribute('aria-hidden', 'true'); ic.innerHTML = '<svg><use href="#' + SEG_ICONS[id] + '"/></svg>'; b.append(ic); }
      else if (SEG_DOTS[id]) { var dt = el('span', 'seg-dots'); dt.setAttribute('aria-hidden', 'true'); SEG_DOTS[id].forEach(function (on) { dt.append(el('i', on ? 'on' : null)); }); b.append(dt); }
      b.append(el('span', 'seg-l', items[id].label));
      b.setAttribute('aria-pressed', String(id === current));
      b.addEventListener('click', function () { pick(id); box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
      box.appendChild(b);
    });
  }
  function atmoRender() {
    $('atmoPower').setAttribute('aria-checked', String(A.sound));
    $('atmoPowerLabel').textContent = A.sound ? 'Sound is on' : 'Sound is off';
    $('soundBtn').setAttribute('aria-pressed', String(A.sound));
    if (E) {
      $('atmoVenueDesc').textContent = E.VENUES[A.venue].desc;
      $('atmoListenerDesc').textContent = E.LISTENERS[A.listener].desc;
    }
    $('atmoBpm').textContent = Math.round(A.bpm);
    // Dandiya Raas brings sticks by default; picking claps or sticks yourself wins until the genre changes
    var theme = S.nonstop ? 'nonstop' : S.genre, style = A.styleChoice || (theme === 'dandiya' ? 'dandiya' : 'claps');
    document.querySelectorAll('#atmoStyles button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === style)); });
    $('atmoStyleDesc').textContent = style === 'dandiya' ? 'Everyone strikes dandiya sticks on the beat.' : 'The circle claps on the beat.';
    if (A.engine && A.style !== style) A.engine.setStyle(style);
    A.style = style;
    // The singers wear the song's artists as cut-out heads, when there's one for them in window.GARBO_SINGERS
    var artists = S.track && S.track.song ? String(S.track.song.artist || '').split(/,|&| and /) : S.nonstop ? (S.nonstop.artists || []) : [];
    var heads = artists.map(function (a) { var f = SINGERS && SINGERS[slugify(String(a).trim())]; return f ? { url: SINGER_BASE + f.file, man: !!f.man } : null; }).filter(Boolean);
    // The stage shows the song's own singers: up to three, those with a portrait first, each with the voice the roster
    // records (the scene fills in any it can't place). A new song key walks the old lineup off and the new one on.
    var seen = {}, lineup = artists.map(function (a) { return String(a).trim(); }).filter(function (a) { var k = slugify(a); if (!a || seen[k] || NOT_A_SINGER.test(a)) return false; seen[k] = true; return true; }).map(function (a) {
      var f = SINGERS && SINGERS[slugify(a)];
      return f ? { name: a, man: !!f.man, url: SINGER_BASE + f.file } : { name: a, man: voiceOf(a), url: null };
    });
    lineup = lineup.filter(function (x) { return x.url; }).concat(lineup.filter(function (x) { return !x.url; })).slice(0, 3);
    var songKey = S.track ? (S.track.kind === 'song' && S.track.song ? 'song:' + (S.track.song.id || S.track.song.title) : S.track.kind === 'chapter' ? 'set:' + (S.track.set && S.track.set.id) + ':' + S.track.chapterIndex : '') : '';
    if (scene.atmosphere) scene.atmosphere({ singerFaces: heads, singers: lineup.length ? lineup : null, songKey: songKey || null });
    if (scene.atmosphere) scene.atmosphere({ youAs: A.youAs, venue: A.venue, listener: A.listener, style: style, theme: theme, mode: A.sound ? A.mode : 'off', level: 0.6, density: 1 });
  }
  function atmoLoadBed(ctx) {
    var beds = window.GARBO_ATMO_BEDS || {
      'ground-crowd': ['../../../../assets/audio/festival-crowd.m4a', '../../../../assets/audio/festival-crowd.ogg'],
      'courtyard-bed': ['../../../../assets/audio/courtyard-night.m4a', '../../../../assets/audio/courtyard-night.ogg']
    };
    return function (role) {
      var urls = beds[role] || [], i = 0;
      function next() {
        if (i >= urls.length) return Promise.resolve(null);
        return fetch(urls[i++]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function (d) { return new Promise(function (ok, bad) { var p = ctx.decodeAudioData(d, ok, bad); if (p && p.then) p.then(ok, bad); }); }).catch(next);
      }
      return next();
    };
  }
  function atmoEnsure() {
    if (A.ctx || !E) return !!A.ctx;
    var Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return false;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* unsupported */ }
    A.ctx = new Ctor({ latencyHint: 'playback' });
    A.engine = E.createEngine(A.ctx, { loadBed: atmoLoadBed(A.ctx) });
    A.engine.setVenue(A.venue, { ramp: 0.05 }); A.engine.setListener(A.listener, { ramp: 0.05 }); A.engine.setPattern(A.pattern); A.engine.setStyle(A.style || 'claps');
    return true;
  }
  // Sound follows the player: it plays only while the song plays and Atmosphere sound is on.
  function atmoSync() {
    var playing = S.mode === 'playing' || S.mode === 'live';
    atmoRender();
    if (!E) return;
    if (A.sound && playing && atmoEnsure()) {
      if (A.running) return;
      A.running = true;
      A.ctx.resume().then(function () { return A.engine.setProfile(ATMO_MODES[A.mode].profile); }).then(function () {
        if (!A.running) return;
        A.engine.setLevel(0.5, 0.3); A.engine.start();
        if (!A.engine.tempo) A.engine.setTempo(A.bpm, A.ctx.currentTime + 0.3);
        clearInterval(A.timer);
        A.timer = setInterval(function () { A.engine.schedule(A.ctx.currentTime + (document.hidden ? 1.6 : 0.2)); }, 25);
      }).catch(function () { A.running = false; });
    } else if (A.running) {
      A.running = false; clearInterval(A.timer);
      if (A.engine) A.engine.stop({ fade: 0.3 });
    }
  }
  // Browsers only start audio from a tap, so wake the audio on any tap while sound is on.
  document.addEventListener('pointerdown', function () { if (A.sound && A.ctx && A.ctx.state !== 'running') A.ctx.resume(); }, true);

  atmoSegment('atmoVenues', E ? E.VENUES : { outdoors: { label: 'Outdoors' } }, A.venue, function (id) { A.venue = id; if (A.engine) A.engine.setVenue(id); atmoSave(); atmoRender(); });
  atmoSegment('atmoListeners', E ? E.LISTENERS : { circle: { label: 'In the circle' } }, A.listener, function (id) { A.listener = id; if (A.engine) A.engine.setListener(id); atmoSave(); atmoRender(); });
  // A quiet switch for which of the couple is you
  function swapText() { $('atmoSwapLabel').textContent = A.youAs === 'man' ? 'Dance as the woman instead' : 'Dance as the man instead'; }
  $('atmoSwap').addEventListener('click', function () { A.youAs = A.youAs === 'man' ? 'woman' : 'man'; swapText(); atmoSave(); atmoRender(); });
  swapText();
  atmoSegment('atmoStyles', { claps: { label: 'Hand claps' }, dandiya: { label: 'Dandiya sticks' } }, 'claps', function (id) { A.styleChoice = id; atmoRender(); });
  atmoSegment('atmoModes', ATMO_MODES, A.mode, function (id) { A.mode = id; if (A.engine && A.running) A.engine.setProfile(ATMO_MODES[id].profile); atmoSave(); atmoRender(); });
  atmoSegment('atmoPatterns', E ? E.PATTERNS : {}, A.pattern, function (id) { A.pattern = id; if (A.engine) A.engine.setPattern(id); atmoSave(); });
  $('atmoPower').addEventListener('click', function () {
    A.sound = !A.sound;
    if (A.sound) { atmoEnsure(); if (A.ctx) A.ctx.resume(); if (S.mode !== 'playing' && S.mode !== 'live') toast('Play a song to hear the circle around it.'); }
    atmoSync();
  });
  if (!E) { $('atmoPower').disabled = true; $('atmoUnavailable').hidden = false; }

  // Tap the beat: a least-squares fit over the taps, the same one the player's Atmosphere panel uses.
  function atmoTapDots(n, locked) {
    document.querySelectorAll('#atmoDots i').forEach(function (d, i) { d.classList.toggle('on', locked || i < n); });
    $('atmoTap').textContent = locked ? 'Tap to adjust' : 'Tap the beat';
  }
  function atmoTap() {
    // Taps are stamped on the page clock, so waking the audio on the first tap cannot shorten the first interval.
    var tappedAt = performance.now() / 1000;
    var b = $('atmoTap'); b.classList.add('hit'); setTimeout(function () { b.classList.remove('hit'); }, 90);
    if (!atmoEnsure()) return;
    A.ctx.resume();
    var last = A.taps[A.taps.length - 1];
    if (last !== undefined && tappedAt - last > 2) A.taps = [];
    A.taps.push(tappedAt); if (A.taps.length > 12) A.taps.shift();
    if (A.taps.length < 4) { atmoTapDots(A.taps.length, false); $('atmoTapHint').textContent = 'Keep going: ' + (4 - A.taps.length) + ' more ' + (4 - A.taps.length === 1 ? 'tap.' : 'taps.'); return; }
    var n = A.taps.length, mx = (n - 1) / 2, my = A.taps.reduce(function (x, y) { return x + y; }, 0) / n, num = 0, den = 0;
    for (var i = 0; i < n; i++) { num += (i - mx) * (A.taps[i] - my); den += (i - mx) * (i - mx); }
    var period = num / den, bpm = 60 / period;
    if (bpm < 50 || bpm > 200) return;
    // Locked: the claps and the venue's echo now follow the song's own beat, as they do after tapping in the player
    A.bpm = bpm; A.engine.setTempo(bpm, A.ctx.currentTime - (performance.now() / 1000 - (my - mx * period)) - (A.ctx.outputLatency || A.ctx.baseLatency || 0), { locked: true });
    atmoTapDots(4, true); $('atmoTapHint').textContent = 'Locked to your taps. The claps now land on the song\'s beat.';
    atmoRender();
  }
  $('atmoTap').addEventListener('pointerdown', function (ev) { ev.preventDefault(); A.tapKeyed = false; atmoTap(); });
  $('atmoTap').addEventListener('click', function (ev) { if (ev.detail === 0 && !A.tapKeyed) atmoTap(); A.tapKeyed = false; });
  $('atmoTap').addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && !ev.repeat) { ev.preventDefault(); A.tapKeyed = true; atmoTap(); } });
  atmoRender();

  /* ---------- layout + loop ---------- */
  function relayout() {
    scene.resize();
    scene.layout($('lampSlot').getBoundingClientRect(), $('np').getBoundingClientRect());
    renderDial();
  }
  window.addEventListener('resize', relayout);
  if (window.ResizeObserver) new ResizeObserver(relayout).observe($('lampSlot'));

  var last = performance.now(), t0 = last, clockAcc = 0, stillT = 1.3;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    clockAcc += dt;
    if (clockAcc >= 0.25) { tick(clockAcc); clockAcc = 0; renderTime(); scene.set({ progress: progress() }); }
    if (!document.hidden) {
      var still = reducedQuery.matches;
      scene.set({ still: still });
      scene.frame(still ? stillT : (now - t0) / 1000, still ? 1 : dt);
      if (openSheet && openSheet.id === 'exploreSheet' && !still) mirrors.frame((now - t0) / 1000);
      if (openSheet && openSheet.id === 'exploreSheet' && still) mirrors.frame(stillT);
    }
    animateClaps(now);
    requestAnimationFrame(loop);
  }
  var clapBeat = -1;
  function animateClaps(now) {
    if (!openSheet || openSheet.id !== 'exploreSheet' || $('panelSteps').hidden || reducedQuery.matches) return;
    var beat = Math.floor(now / 520) % 4;
    if (beat === clapBeat) return; clapBeat = beat;
    document.querySelectorAll('.claps').forEach(function (c) { c.querySelectorAll('i').forEach(function (d, i) { d.classList.toggle('hit', i === beat && d.classList.contains('c')); }); });
  }

  function applyHash() {
    var h = location.hash.replace('#', '');
    if (!h) return;
    if (h.indexOf('live=') === 0) { needLives().then(function () { joinFromLink(h.slice(5)); }, function () { toast("This live couldn't load. Check your connection."); }); return; }
    if (h === 'lives') needLives().then(function () { showSheet('livesSheet', 'hostNew'); });
    if (h === 'host') needLives().then(function () { openHost(null); });
    var st = STATES.filter(function (x) { return x.id === h; })[0];
    if (st) { st.run(); return; }
    if (h === 'explore') showSheet('exploreSheet');
    if (h === 'steps') { showSheet('exploreSheet'); selectTab(2); }
    if (h === 'nonstop-list') { showSheet('exploreSheet'); selectTab(1); }
    if (h === 'tonight-sheet') showSheet('tonightSheet');
    if (h === 'more') showSheet('moreSheet');
    if (h === 'atmosphere') openCard('soundCard');
    if (h === 'ideas') openCard('ideaCard');
    ['outdoors', 'stadium', 'sheri'].forEach(function (v) { if (h === v || h === v + '-far') { A.venue = v; A.listener = h === v ? 'circle' : 'far'; if (A.engine) { A.engine.setVenue(v); A.engine.setListener(A.listener); } atmoRender(); } });
    if (h === 'about') showSheet('aboutPage');
    if (h === 'share') showSheet('shareSheet');
  }

  fetch('sample.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (data) {
    if (!S.data) {
      S.data = data; S.genres = data.genres;
      data.songs.forEach(function (s) { songById[s.id] = s; });
      buildDial(); buildChips(); buildSteps(); buildTonight(); buildStates();
      setGenre('traditional', false);
      initYtPlayer();
      relayout();
    } else {
      if (!Array.isArray(S.data.songs) || !S.data.songs.length) {
        S.data.songs = data.songs;
      }
      if (!Array.isArray(S.data.nonstopSets) || !S.data.nonstopSets.length) {
        S.data.nonstopSets = data.nonstopSets;
      }
      data.songs.forEach(function (s) { if (!songById[s.id]) songById[s.id] = s; });
      if (Array.isArray(S.data.songs)) {
        S.data.songs.forEach(function (s) { songById[s.id] = s; });
      }
      initYtPlayer();
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    requestAnimationFrame(loop);
    if (pendingLiveSnapshot) {
      var pending = pendingLiveSnapshot;
      pendingLiveSnapshot = null;
      applyLiveState(pending);
    }
  }).catch(function () {
    if (LIVE_SITE && S.data && Array.isArray(S.data.songs) && S.data.songs.length) {
      applyHash();
      window.addEventListener('hashchange', applyHash);
      requestAnimationFrame(loop);
      return;
    }
    $('title').textContent = "Couldn't load the sample catalogue";
    $('artist').textContent = 'Serve this folder over http so sample.json can load.';
    $('eyebrow').textContent = ''; $('from').textContent = '';
    setMode('empty');
    relayout(); requestAnimationFrame(loop);
  });
})();
