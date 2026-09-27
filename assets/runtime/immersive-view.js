/*
 * PlayGarba Immersive view and the More card.
 *
 * Simple and Immersive are complete, mutually exclusive player surfaces. The production player remains
 * mounted as the playback owner while the complete Garbo prototype is shown in an isolated frame.
 *
 * More gathers the less-used top-bar actions (share, Garba Circle, My Garba, Atmosphere). A separate
 * switch below More chooses the player renderer. Proxy rows still act through the original buttons.
 */
(function () {
  'use strict';

  var VIEW_KEY = 'garba:view';
  var app = document.getElementById('app');
  if (!app || !window.GARBA_IMMERSIVE_PLAYER || window.GARBA_IMMERSIVE_VIEW) return;

  var view = 'simple';
  // A first visit opens Immersive, standing by the stage in the indoor stadium; a visitor's own choice is kept after
  // that. Automated test browsers keep Simple unless a test opts in, so the Simple player's harnesses test Simple.
  var ATMO_KEY = 'garbo-proto-atmosphere';
  var firstVisit = false;
  try {
    var savedView = localStorage.getItem(VIEW_KEY);
    if (savedView === 'immersive') view = 'immersive';
    else if (savedView == null && !navigator.webdriver) { view = 'immersive'; firstVisit = true; }
    if (firstVisit) {
      var atmo = JSON.parse(localStorage.getItem(ATMO_KEY) || '{}') || {};
      if (!atmo.venue && !atmo.listener) { atmo.venue = 'stadium'; atmo.listener = 'stage'; localStorage.setItem(ATMO_KEY, JSON.stringify(atmo)); }
    }
  } catch (e) { /* storage unavailable */ }

  /* ---------- complete embedded prototype ---------- */
  var overlay = null, frame = null, syncTimer = 0, catalogueSent = false, catalogueSignature = '';
  var nonstopSets = [], nonstopSetsStatus = 'loading', nonstopPromise = null;
  var CHANNEL = 'playgarba:immersive-prototype';
  function ensureFrame() {
    if (overlay) return;
    overlay = document.createElement('section');
    overlay.className = 'garbo-prototype-overlay';
    overlay.setAttribute('aria-label', 'Immersive Garbo player'); overlay.hidden = true;
    frame = document.createElement('iframe'); frame.className = 'garbo-prototype-frame';
    frame.title = 'Garbo player prototype'; frame.allow = 'autoplay; clipboard-write; fullscreen'; frame.tabIndex = 0;
    overlay.append(frame); document.body.appendChild(overlay);
    frame.addEventListener('load', function () { sendSnapshot(true); armFirstTap(); });
  }

  /* ---------- the first tap starts the music ----------
     Browsers only let sound start from a visitor's own tap. Until the song is playing, the first tap on the page
     that isn't on a control starts it, wherever it lands: on the venue inside the frame or on the page around it. */
  var tapArmed = false, tapDocs = [], hint = null;
  var CONTROL = 'button, a, input, select, textarea, label, summary, [role="button"], [role="switch"], [role="slider"], [role="tab"], [contenteditable]';
  function isPlaying() { try { return !!window.GARBA_IMMERSIVE_PLAYER.snapshot().playing; } catch (e) { return false; } }
  function onFirstTap(event) {
    if (view !== 'immersive' || !tapArmed) return;
    var target = event.target;
    if (target && target.closest && target.closest(CONTROL)) { if (isPlaying()) disarmFirstTap(); return; }
    disarmFirstTap();
    if (!isPlaying()) { window.GARBA_IMMERSIVE_PLAYER.action('play'); sendSnapshot(false); }
  }
  function showHint(on) {
    if (on && !hint && overlay) {
      hint = document.createElement('p');
      hint.className = 'garbo-first-tap';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = 'Tap anywhere to start the garba';
      // Over the stage, clear of the buttons down the right-hand side
      hint.style.cssText = 'position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);margin:0;padding:10px 18px;border-radius:22px;'
        + 'max-width:calc(100% - 150px);box-sizing:border-box;text-align:center;'
        + 'background:rgba(11,6,5,.62);color:#f6e7c8;font:600 15px/1.3 system-ui,sans-serif;letter-spacing:.01em;pointer-events:none;'
        + 'z-index:2;transition:opacity .6s ease;opacity:0;';
      overlay.appendChild(hint);
      requestAnimationFrame(function () { if (hint) hint.style.opacity = '1'; });
    } else if (!on && hint) {
      var h = hint; hint = null; h.style.opacity = '0'; setTimeout(function () { h.remove(); }, 650);
    }
  }
  function armFirstTap() {
    if (view !== 'immersive' || isPlaying()) { disarmFirstTap(); return; }
    tapArmed = true;
    var docs = [document];
    try { if (frame && frame.contentDocument) docs.push(frame.contentDocument); } catch (e) { /* not same-origin */ }
    // The frame's document is replaced as its page loads, so each check catches the current one
    docs.forEach(function (d) { if (tapDocs.indexOf(d) < 0) { d.addEventListener('pointerdown', onFirstTap, true); tapDocs.push(d); } });
    showHint(true);
  }
  function disarmFirstTap() {
    tapArmed = false;
    tapDocs.forEach(function (d) { try { d.removeEventListener('pointerdown', onFirstTap, true); } catch (e) { /* frame gone */ } });
    tapDocs = [];
    showHint(false);
  }
  function sendSnapshot(includeCatalogue) {
    if (!frame || !frame.contentWindow || view !== 'immersive') return;
    var snapshot = window.GARBA_IMMERSIVE_PLAYER.snapshot();
    var sendCatalogue = includeCatalogue || !catalogueSent || snapshot.catalogueSignature !== catalogueSignature;
    if (sendCatalogue) {
      snapshot = window.GARBA_IMMERSIVE_PLAYER.snapshot({ includeCatalogue: true });
      snapshot.nonstopSets = nonstopSets;
      snapshot.nonstopSetsStatus = nonstopSetsStatus;
    }
    if (Array.isArray(snapshot.songs) && snapshot.songs.length) {
      catalogueSent = true;
      catalogueSignature = snapshot.catalogueSignature || '';
    }
    frame.contentWindow.postMessage({ channel: CHANNEL, type: 'state', snapshot: snapshot }, location.origin);
  }
  function syncNonstopCatalogue() {
    if (nonstopPromise) return nonstopPromise;
    if (typeof window.GARBA_IMMERSIVE_PLAYER.loadNonstopCatalogue !== 'function') {
      nonstopSetsStatus = 'error';
      sendSnapshot(true);
      return Promise.resolve([]);
    }
    nonstopPromise = window.GARBA_IMMERSIVE_PLAYER.loadNonstopCatalogue().then(function (sets) {
      nonstopSets = Array.isArray(sets) ? sets : [];
      nonstopSetsStatus = 'ready';
      sendSnapshot(true);
      return nonstopSets;
    }).catch(function () {
      nonstopSets = [];
      nonstopSetsStatus = 'error';
      sendSnapshot(true);
      return [];
    });
    return nonstopPromise;
  }
  function onMessage(event) {
    if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    var message = event.data;
    if (!message || message.channel !== CHANNEL) return;
    if (message.type === 'view') { setView(message.view); return; }
    if (message.type === 'ready') {
      catalogueSent = false;
      sendSnapshot(true);
      if (typeof window.GARBA_IMMERSIVE_PLAYER.syncCatalogue === 'function') {
        window.GARBA_IMMERSIVE_PLAYER.syncCatalogue().then(function () {
          if (view === 'immersive') sendSnapshot(true);
        }).catch(function () { /* keep the current player snapshot available */ });
      }
      syncNonstopCatalogue();
    }
    else if (message.type === 'action' && typeof message.action === 'string') {
      if (message.action === 'circle') setView('simple', true);
      window.GARBA_IMMERSIVE_PLAYER.action(message.action, message.value);
      sendSnapshot(false);
    } else if (message.type === 'exit') setView('simple');
  }
  function startPrototype() {
    ensureFrame(); overlay.hidden = false;
    closeCard(false);
    app.setAttribute('aria-hidden', 'true'); app.inert = true;
    if (!frame.src) {
      var isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      var protoPath = isLocalDev ? './docs/product/prototypes/garbo/?live=1&embed=1&v=20260926-3' : './garbo/prototype/?live=1&embed=1&v=20260926-3';
      frame.src = new URL(protoPath, location.href).href;
    }
    window.addEventListener('message', onMessage);
    sendSnapshot(true);
    clearInterval(syncTimer);
    syncTimer = setInterval(function () { sendSnapshot(!catalogueSent); if (tapArmed) { if (isPlaying()) disarmFirstTap(); else armFirstTap(); } }, 500);
    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') armFirstTap();
    frame.focus({ preventScroll: true });
  }
  function stopPrototype() {
    var wasOpen = overlay && !overlay.hidden;
    clearInterval(syncTimer); syncTimer = 0;
    disarmFirstTap();
    window.removeEventListener('message', onMessage);
    if (overlay) overlay.hidden = true;
    app.removeAttribute('aria-hidden'); app.inert = false;
    catalogueSent = false; catalogueSignature = '';
    nonstopPromise = null;
    if (wasOpen) {
      var simpleSwitch = document.querySelector('[data-view-switch]');
      if (simpleSwitch) simpleSwitch.focus({ preventScroll: true });
      else if (moreButton) moreButton.focus({ preventScroll: true });
    }
  }

  function setView(next, quiet) {
    view = next === 'immersive' ? 'immersive' : 'simple';
    try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* storage unavailable */ }
    app.classList.toggle('view-immersive', view === 'immersive');
    if (view === 'immersive') startPrototype(); else stopPrototype();
    renderViewChoice();
    if (!quiet) announce(view === 'immersive' ? 'Immersive view on' : 'Simple view on');
  }

  function announce(message) {
    var live = document.getElementById('immersiveViewStatus');
    if (live) { live.textContent = ''; setTimeout(function () { live.textContent = message; }, 30); }
  }

  /* ---------- the More card ---------- */
  var moreButton = document.getElementById('moreButton');
  var card = document.getElementById('moreCard');
  var opener = null;

  function renderViewChoice() {
    document.querySelectorAll('[data-view-switch]').forEach(function (b) { b.setAttribute('aria-checked', String(view === 'immersive')); });
  }
  // A row shows the state of the button it stands for, and only when that button exists on this page
  function renderRows() {
    if (!card) return;
    card.querySelectorAll('[data-proxy]').forEach(function (row) {
      var target = document.getElementById(row.dataset.proxy);
      row.hidden = !target;
      if (!target) return;
      var pressed = target.getAttribute('aria-pressed');
      if (pressed != null) row.setAttribute('aria-pressed', pressed); else row.removeAttribute('aria-pressed');
      var badge = row.querySelector('.more-badge'), src = target.querySelector('.utility-badge');
      if (badge) badge.textContent = src ? src.textContent : '';
    });
  }
  function openCard() {
    if (!card || !moreButton) return;
    opener = document.activeElement;
    renderRows(); renderViewChoice();
    card.hidden = false; moreButton.setAttribute('aria-expanded', 'true');
    var first = card.querySelector('[data-view][aria-pressed="true"]') || card.querySelector('button');
    if (first) first.focus();
  }
  function closeCard(restore) {
    if (!card || card.hidden) return;
    card.hidden = true; moreButton.setAttribute('aria-expanded', 'false');
    if (restore && moreButton) moreButton.focus();
  }

  if (moreButton && card) {
    moreButton.addEventListener('click', function (e) { e.stopPropagation(); if (card.hidden) openCard(); else closeCard(true); });
    card.addEventListener('click', function (e) {
      var row = e.target.closest('[data-proxy]');
      if (row) {
        var target = document.getElementById(row.dataset.proxy);
        closeCard(false);
        if (target) target.click();
        return;
      }
      if (e.target.closest('[data-more-close]')) closeCard(true);
    });
    document.addEventListener('click', function (e) { if (!card.hidden && !card.contains(e.target) && e.target !== moreButton && !moreButton.contains(e.target)) closeCard(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !card.hidden) { e.preventDefault(); closeCard(true); } });
  }

  document.addEventListener('click', function (e) {
    var button = e.target.closest('[data-view-switch]');
    if (button) setView(view === 'immersive' ? 'simple' : 'immersive');
  });

  /* ---------- wiring ---------- */
  window.addEventListener('garba:playback-state-change', function () { sendSnapshot(false); });
  window.addEventListener('garba:atmosphere-change', function () { sendSnapshot(false); });

  window.GARBA_IMMERSIVE_VIEW = {
    get view() { return view; },
    set view(v) { setView(v, true); },
    get sceneReady() { return !!frame && !overlay.hidden; },
  };

  setView(view, true);
})();
