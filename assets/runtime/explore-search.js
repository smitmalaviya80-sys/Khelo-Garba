const input = document.getElementById('catalogueSearch');
const status = input?.closest('.catalogue-status');
const topbar = document.querySelector('.topbar');
const spacer = topbar?.querySelector('.topbar-spacer');

if (input && status && topbar && spacer) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-explore';
  button.setAttribute('aria-label', 'Search PlayGarba');
  button.setAttribute('aria-controls', 'catalogueSearchPanel');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-keyshortcuts', '/ Control+K Meta+K');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8"></circle><path d="m15.4 15.4 4.6 4.6"></path></svg>';
  spacer.replaceWith(button);

  status.id = 'catalogueSearchPanel';
  status.setAttribute('role', 'search');
  status.setAttribute('aria-hidden', 'true');
  input.placeholder = 'Search songs, artists or albums';
  input.removeAttribute('tabindex');
  input.setAttribute('enterkeyhint', 'search');
  input.setAttribute('aria-label', 'Search songs, artists or albums');

  const label = input.closest('label');
  label?.classList.add('explore-search-label');
  const searchIcon = document.createElement('svg');
  searchIcon.className = 'explore-search-field-icon';
  searchIcon.setAttribute('viewBox', '0 0 24 24');
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.innerHTML = '<circle cx="10.8" cy="10.8" r="5.8"></circle><path d="m15.4 15.4 4.6 4.6"></path>';
  label?.prepend(searchIcon);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'explore-search-clear';
  clear.setAttribute('aria-label', 'Clear search');
  clear.hidden = true;
  clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"></path></svg>';
  label?.append(clear);

  const hint = document.createElement('p');
  hint.className = 'explore-search-hint';
  hint.textContent = 'Search 1,000+ Garba songs, artists and releases';
  status.append(hint);

  const style = document.createElement('style');
  style.dataset.playgarbaExploreSearch = '';
  style.textContent = `
    .search-explore{grid-column:1;justify-self:start;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:12px;color:var(--text);background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;cursor:pointer;transition:transform .18s ease,background .18s ease,color .18s ease,opacity .18s ease}
    .search-explore svg,.explore-search-field-icon,.explore-search-clear svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
    .search-explore:hover{background:rgba(255,255,255,.055)}
    .search-explore:active{transform:scale(.96);background:rgba(255,255,255,.075)}
    .search-explore:focus-visible,.explore-search-clear:focus-visible,.explore-search-label:focus-within{outline:2px solid var(--gold);outline-offset:3px}
    .search-explore:disabled{opacity:.45;cursor:wait}
    body.explore-search-open .search-explore{color:var(--gold);background:rgba(231,201,143,.055)}
    .catalogue-status{display:none}
    body.explore-search-open .catalogue-status{position:fixed;top:max(78px,calc(env(safe-area-inset-top) + 68px));left:50%;z-index:60;display:block;width:min(680px,calc(100% - 34px));padding:12px;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:rgba(13,12,17,.78);box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 28px 90px rgba(0,0,0,.38);backdrop-filter:blur(28px) saturate(1.16);-webkit-backdrop-filter:blur(28px) saturate(1.16);transform:translateX(-50%);animation:exploreSearchIn .18s cubic-bezier(.2,.7,.2,1)}
    .explore-search-label{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;min-height:52px;padding:0 14px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.055);transition:border-color .16s ease,background .16s ease}
    .explore-search-label:focus-within{border-color:rgba(231,201,143,.30);background:rgba(255,255,255,.07)}
    .explore-search-field-icon{color:rgba(255,248,236,.62)}
    .explore-search-label input{min-width:0;width:100%;padding:0;border:0;outline:0;color:var(--text);background:transparent;font-size:1rem;line-height:1.2}
    .explore-search-label input::placeholder{color:rgba(255,248,236,.44)}
    .explore-search-label input::-webkit-search-cancel-button{display:none}
    .explore-search-clear{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:8px;color:rgba(255,248,236,.70);background:transparent;cursor:pointer}
    .explore-search-clear:hover{background:rgba(255,255,255,.055)}
    .explore-search-clear[hidden]{display:none}
    .catalogue-status #catalogueCount{margin:8px 4px 0;color:rgba(255,248,236,.48);font-size:.72rem;line-height:1.35}
    .explore-search-hint{margin:5px 4px 0;color:rgba(255,248,236,.36);font-size:.69rem;line-height:1.35}
    body.explore-search-open::before{filter:saturate(.94) contrast(1.02) brightness(.78)}
    @keyframes exploreSearchIn{from{opacity:0;transform:translate(-50%,-8px) scale(.985)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
    @media(max-width:640px){.search-explore{width:44px;height:44px}.search-explore svg{width:19px;height:19px}body.explore-search-open .catalogue-status{top:max(74px,calc(env(safe-area-inset-top) + 64px));width:calc(100% - 36px);padding:9px;border-radius:18px}.explore-search-label{min-height:50px;border-radius:14px}.explore-search-hint{display:none}}
    @media(prefers-reduced-motion:reduce){body.explore-search-open .catalogue-status{animation:none}.search-explore{transition:none!important}}
  `;
  document.head.append(style);

  let restoreFocus = true;
  const isOpen = () => document.body.classList.contains('explore-search-open');
  const updateClear = () => { clear.hidden = !input.value.trim(); };

  function openSearch({ focus = true } = {}) {
    document.body.classList.add('explore-search-open');
    status.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    updateClear();
    if (focus && !input.disabled) requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  function closeSearch({ clearQuery = true, focusButton = restoreFocus } = {}) {
    if (clearQuery && input.value) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.body.classList.remove('explore-search-open');
    status.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-expanded', 'false');
    updateClear();
    if (focusButton && button.isConnected) requestAnimationFrame(() => button.focus({ preventScroll: true }));
  }

  button.addEventListener('click', () => {
    if (isOpen()) closeSearch();
    else openSearch();
  });

  clear.addEventListener('click', () => {
    if (!input.value) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    updateClear();
    input.focus({ preventScroll: true });
  });

  input.addEventListener('input', updateClear);

  document.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const typing = Boolean(target?.closest('input,textarea,select,[contenteditable="true"]'));
    const searchShortcut = event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k');
    if (searchShortcut && !typing) {
      event.preventDefault();
      restoreFocus = false;
      openSearch();
      restoreFocus = true;
      return;
    }
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSearch();
    }
  }, { capture: true });

  const inputStateObserver = new MutationObserver(() => { button.disabled = input.disabled; });
  inputStateObserver.observe(input, { attributes: true, attributeFilter: ['disabled'] });
  button.disabled = input.disabled;

  function syncFromHistory() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const query = params.get('search');
    if (query) {
      openSearch({ focus: false });
      updateClear();
    } else if (isOpen() && !input.value) {
      closeSearch({ clearQuery: false, focusButton: false });
    }
  }

  window.addEventListener('popstate', () => requestAnimationFrame(syncFromHistory));
  queueMicrotask(syncFromHistory);
}

(() => {
  const songList = document.getElementById('catalogueSongList');
  const sectionRoot = document.getElementById('catalogueSections');
  if (!songList || !sectionRoot) return;

  const STORAGE_KEY = 'playgarba:explore:shelf-scrolls';
  const SHELF_SELECTOR = '.collection-grid--shelf,.essential-release-rail,.release-rail';
  const AUTO_PAGE_COOLDOWN_MS = 650;
  let pagerObserver = null;
  let refreshQueued = false;
  let lastAutoPageAt = 0;
  let saveTimer = 0;

  const performanceStyle = document.createElement('style');
  performanceStyle.dataset.playgarbaExplorePerformance = '';
  performanceStyle.textContent = `
    html{scroll-padding-top:92px}
    .catalogue-section{content-visibility:auto;contain-intrinsic-size:auto 560px}
    .collection-card{transform:none;contain:layout paint style}
    .song-row{content-visibility:auto;contain-intrinsic-size:72px;contain:layout paint style}
    .release-card,.release-more{content-visibility:auto;contain-intrinsic-size:236px}
    .collection-grid--shelf,.release-rail,.essential-release-rail{-webkit-overflow-scrolling:touch;overscroll-behavior-inline:contain}
    .song-more[data-auto-paging="true"]{position:relative;justify-self:stretch;width:100%;min-height:52px;border-style:dashed;color:rgba(255,248,236,.66);background:rgba(255,255,255,.025);pointer-events:none}
    .song-more[data-auto-paging="true"]::after{content:"";display:inline-block;width:13px;height:13px;margin-left:9px;border:1.5px solid rgba(255,248,236,.28);border-top-color:var(--gold);border-radius:50%;vertical-align:-2px;animation:exploreAutoPageSpin .75s linear infinite}
    @keyframes exploreAutoPageSpin{to{transform:rotate(1turn)}}
    @media(max-width:900px){
      .catalogue-section{contain-intrinsic-size:auto 340px}
      .section-title-row p{display:none}
      .collection-grid--shelf{grid-template-columns:none!important;grid-auto-flow:column;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity;scrollbar-width:none;touch-action:pan-x pan-y}
      .collection-grid--shelf::-webkit-scrollbar,.release-rail::-webkit-scrollbar,.essential-release-rail::-webkit-scrollbar{display:none}
      .collection-grid--shelf .collection-card{width:auto;scroll-snap-align:start;scroll-snap-stop:normal}
    }
    @media(max-width:560px){
      html{scroll-padding-top:78px}
      main{padding-bottom:max(64px,calc(42px + env(safe-area-inset-bottom)))}
      .collection-home{padding-top:2px}
      .catalogue-section{contain-intrinsic-size:auto 310px}
      .songs-section,.release-section{content-visibility:auto;contain-intrinsic-size:auto 620px}
      .song-row{contain-intrinsic-size:66px}
    }
    @media(pointer:coarse){
      body::before{filter:saturate(1.01) contrast(1.01);transform:scale(1.008)}
      .collection-card,.collection-image,.collection-card::after,.essential-release-card,.release-cover{transition-duration:.12s!important}
      .collection-card{box-shadow:0 12px 30px rgba(0,0,0,.2)}
      .collection-card::after{mix-blend-mode:normal;opacity:.72;transform:none}
      .collection-image{transform:scale(1.018)}
    }
    @media(max-width:560px){body::before{transform:none}}
    @media(prefers-reduced-motion:reduce){.song-more[data-auto-paging="true"]::after{animation:none}}
  `;
  document.head.append(performanceStyle);

  function readShelfState() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function shelfKey(shelf) {
    const section = shelf.closest('.catalogue-section,.release-section');
    return section?.querySelector('.section-title-row h2,.section-heading h3')?.textContent?.trim() || shelf.id || null;
  }

  function saveShelfPositions() {
    const state = readShelfState();
    document.querySelectorAll(SHELF_SELECTOR).forEach((shelf) => {
      const key = shelfKey(shelf);
      if (!key) return;
      state[key] = Math.max(0, Math.round(shelf.scrollLeft));
    });
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Scroll memory is optional. Never let storage failure affect browsing.
    }
  }

  function restoreShelfPositions(root = document) {
    const saved = readShelfState();
    root.querySelectorAll?.(SHELF_SELECTOR).forEach((shelf) => {
      const key = shelfKey(shelf);
      const left = key ? Number(saved[key]) : 0;
      if (!Number.isFinite(left) || left <= 0) return;
      requestAnimationFrame(() => {
        shelf.scrollLeft = Math.min(left, Math.max(0, shelf.scrollWidth - shelf.clientWidth));
      });
    });
  }

  function bindShelves(root = document) {
    root.querySelectorAll?.(SHELF_SELECTOR).forEach((shelf) => {
      if (!(shelf instanceof HTMLElement) || shelf.dataset.scrollContinuityBound === 'true') return;
      shelf.dataset.scrollContinuityBound = 'true';
      shelf.addEventListener('scroll', () => {
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveShelfPositions, 140);
      }, { passive: true });
    });
    restoreShelfPositions(root);
  }

  function bindSongPager() {
    pagerObserver?.disconnect();
    pagerObserver = null;
    const more = songList.querySelector('.song-more');
    if (!(more instanceof HTMLButtonElement)) return;
    more.removeAttribute('data-auto-paging');
    if (!('IntersectionObserver' in window)) return;

    pagerObserver = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastAutoPageAt < AUTO_PAGE_COOLDOWN_MS || !more.isConnected || more.disabled) return;
      lastAutoPageAt = now;
      more.dataset.autoPaging = 'true';
      more.textContent = 'Loading more songs';
      pagerObserver?.disconnect();
      requestAnimationFrame(() => more.click());
    }, { rootMargin: '950px 0px 1150px 0px', threshold: .01 });

    pagerObserver.observe(more);
  }

  function refresh() {
    refreshQueued = false;
    bindShelves(document);
    bindSongPager();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(refresh);
  }

  new MutationObserver(queueRefresh).observe(sectionRoot, { childList: true, subtree: true });
  new MutationObserver(queueRefresh).observe(songList, { childList: true, subtree: true });
  window.addEventListener('pagehide', saveShelfPositions);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveShelfPositions();
  });

  refresh();
})();

(() => {
  const responsiveStyle = document.createElement('style');
  responsiveStyle.dataset.playgarbaExploreResponsive = '';
  responsiveStyle.textContent = `
    :root{--explore-gutter:clamp(18px,3vw,42px)}
    .topbar,main{width:min(var(--max),calc(100% - (var(--explore-gutter) * 2)))}
    .topbar{min-height:82px;padding-top:max(10px,env(safe-area-inset-top));isolation:isolate}
    .topbar::before{content:"";position:absolute;inset:0 calc(var(--explore-gutter) * -1);z-index:-1;pointer-events:none;background:linear-gradient(to bottom,rgba(8,8,11,.82),rgba(8,8,11,.42) 62%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);mask-image:linear-gradient(to bottom,#000 0 68%,transparent);-webkit-mask-image:linear-gradient(to bottom,#000 0 68%,transparent)}
    .explore-title{font-size:clamp(1.16rem,1.7vw,1.38rem);white-space:nowrap}
    main{padding-top:clamp(8px,1.5vw,18px)}
    .collection-home{padding-top:clamp(3px,1vw,10px)}
    .catalogue-section{margin-bottom:clamp(38px,4.2vw,54px)}
    .section-title-row{margin-inline:2px;margin-bottom:15px}
    .section-title-row h2{font-size:clamp(1.03rem,1.6vw,1.22rem)}
    .collection-grid:not(.collection-grid--taxonomy):not(.collection-grid--artist){gap:clamp(12px,1.25vw,17px)}
    .collection-card:not(.collection-card--taxonomy):not(.collection-card--artist){min-height:clamp(214px,19vw,276px);border-radius:clamp(21px,2vw,26px)}
    .collection-card:not(.collection-card--taxonomy):not(.collection-card--artist) .collection-copy{inset:clamp(18px,2.1vw,26px)}
    .collection-card:not(.collection-card--taxonomy):not(.collection-card--artist) .collection-copy strong{font-size:clamp(1.28rem,2vw,1.76rem)}
    .essential-release-section{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
    .essential-release-card{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
    .release-section,.songs-section{scroll-margin-top:100px}
    .release-rail,.essential-release-rail{scroll-padding-inline:3px}
    .release-title,.release-meta{overflow:hidden;text-overflow:ellipsis}
    .release-title{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;min-height:2.5em}

    @media(min-width:1181px){
      .collection-grid:not(.collection-grid--destination):not(.collection-grid--taxonomy):not(.collection-grid--artist){grid-template-columns:repeat(4,minmax(0,1fr))}
      .collection-card:not(.collection-card--destination):not(.collection-card--taxonomy):not(.collection-card--artist){aspect-ratio:1.2/1}
    }

    @media(min-width:901px) and (max-width:1180px){
      :root{--explore-gutter:clamp(24px,3.2vw,36px)}
      .collection-grid:not(.collection-grid--destination):not(.collection-grid--taxonomy):not(.collection-grid--artist){grid-template-columns:repeat(3,minmax(0,1fr))}
      .collection-card:not(.collection-card--destination):not(.collection-card--taxonomy):not(.collection-card--artist){min-height:220px;aspect-ratio:1.12/1}
      .collection-card:not(.collection-card--destination):not(.collection-card--taxonomy):not(.collection-card--artist) .collection-copy strong{font-size:clamp(1.28rem,2.5vw,1.62rem)}
      .section-title-row p{max-width:44vw}
    }

    @media(min-width:641px) and (max-width:900px){
      :root{--explore-gutter:clamp(20px,3.4vw,30px)}
      html{scroll-padding-top:94px}
      .topbar{min-height:80px}
      main{padding-top:8px}
      .catalogue-section{margin-bottom:38px;contain-intrinsic-size:auto 340px}
      .section-title-row{margin-bottom:14px}
      body .collection-grid--shelf{grid-template-columns:none!important;grid-auto-flow:column;grid-auto-columns:minmax(270px,44vw);gap:14px;overflow-x:auto;overflow-y:hidden;margin-inline:calc(var(--explore-gutter) * -1);padding:4px var(--explore-gutter) 15px;scroll-snap-type:x proximity;scroll-padding-inline:var(--explore-gutter);scrollbar-width:none;touch-action:pan-x pan-y}
      body .collection-grid--shelf .collection-card{width:auto;min-height:204px;aspect-ratio:1.18/1;border-radius:24px;scroll-snap-align:start;scroll-snap-stop:normal}
      body .collection-grid--shelf .collection-copy strong{font-size:clamp(1.3rem,3.7vw,1.62rem)}
      .essential-release-section{margin-bottom:40px}
      .essential-release-rail{grid-auto-columns:minmax(174px,25vw)}
    }

    @media(max-width:640px){
      :root{--explore-gutter:clamp(18px,4.8vw,22px)}
      html{scroll-padding-top:80px}
      .topbar,main{width:calc(100% - (var(--explore-gutter) * 2))}
      .topbar{min-height:72px;padding-top:max(8px,env(safe-area-inset-top))}
      .topbar::before{inset-inline:calc(var(--explore-gutter) * -1)}
      .explore-title{font-size:1.13rem}
      .search-explore,.close-explore{width:44px;height:44px}
      main{padding-top:7px;padding-bottom:max(72px,calc(48px + env(safe-area-inset-bottom)))}
      .collection-home{padding-top:2px}
      .catalogue-section{margin-bottom:40px;contain-intrinsic-size:auto 310px}
      .section-title-row{margin-inline:0;margin-bottom:14px}
      .section-title-row h2{font-size:1.02rem}
      body .collection-grid--shelf{grid-template-columns:none!important;grid-auto-flow:column;grid-auto-columns:minmax(250px,82vw);gap:12px;overflow-x:auto;overflow-y:hidden;margin-inline:calc(var(--explore-gutter) * -1);padding:3px var(--explore-gutter) 14px;scroll-snap-type:x proximity;scroll-padding-inline:var(--explore-gutter);scrollbar-width:none;touch-action:pan-x pan-y}
      body .collection-grid--shelf .collection-card{width:auto;min-height:176px;aspect-ratio:1.38/1;border-radius:21px;scroll-snap-align:start;scroll-snap-stop:normal}
      body .collection-grid--shelf .collection-copy{inset:16px}
      body .collection-grid--shelf .collection-copy small{font-size:.62rem;margin-bottom:6px}
      body .collection-grid--shelf .collection-copy strong{max-width:15ch;font-size:clamp(1.26rem,6.3vw,1.56rem);line-height:1.04}
      body .collection-grid--shelf .collection-copy span{margin-top:8px;font-size:.68rem}
      .essential-release-section{margin-inline:0;margin-bottom:40px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
      .essential-release-section .section-title-row{margin-bottom:14px}
      .essential-release-rail{grid-auto-columns:minmax(142px,42vw);gap:12px;margin-inline:calc(var(--explore-gutter) * -1);padding:2px var(--explore-gutter) 10px;scroll-padding-inline:var(--explore-gutter)}
      .essential-release-card{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
      body.explore-search-open .catalogue-status{width:calc(100% - (var(--explore-gutter) * 2));max-height:calc(100dvh - max(86px,calc(env(safe-area-inset-top) + 76px)));padding:9px;border-radius:18px}
      .explore-search-label{min-height:50px;border-radius:14px}
    }

    @media(max-width:420px){
      body .collection-grid--shelf{grid-auto-columns:minmax(244px,84vw)}
    }

    @media(max-width:350px){
      :root{--explore-gutter:16px}
      .search-explore,.close-explore{width:44px;height:44px}
      body .collection-grid--shelf{grid-auto-columns:minmax(238px,84vw)}
      body .collection-grid--shelf .collection-card{min-height:168px}
    }

    @media(max-height:600px) and (orientation:landscape){
      .topbar{min-height:60px;padding-top:max(5px,env(safe-area-inset-top))}
      .search-explore,.close-explore{width:44px;height:44px}
      main{padding-top:2px}
      .catalogue-section{margin-bottom:28px}
      body .collection-grid--shelf{grid-auto-columns:minmax(230px,34vw);padding-bottom:10px}
      body .collection-grid--shelf .collection-card{min-height:154px;aspect-ratio:1.42/1}
    }

    @media(pointer:coarse){
      .release-card{touch-action:manipulation}
      .collection-card{touch-action:manipulation}
    }

    @media(prefers-reduced-motion:reduce){
      .topbar::before{backdrop-filter:none;-webkit-backdrop-filter:none}
    }
  `;
  document.head.append(responsiveStyle);
})();

(() => {
  const detail = document.getElementById('collectionDetail');
  const releaseSection = document.getElementById('releaseSection');
  const releaseRail = document.getElementById('releaseRail');
  const showAll = document.getElementById('showAllSongs');
  const songsSection = detail?.querySelector('.songs-section');
  const songsHeading = songsSection?.querySelector('.section-heading > div');
  const songsEyebrow = songsSection?.querySelector('.eyebrow');
  if (!detail || !releaseSection || !releaseRail || !showAll || !songsSection || !songsHeading || !songsEyebrow) return;

  const selectedContext = document.createElement('p');
  selectedContext.className = 'selected-release-context';
  selectedContext.hidden = true;
  songsHeading.append(selectedContext);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let syncQueued = false;

  function revealActiveRelease(active) {
    if (!(active instanceof HTMLElement)) return;
    const railRect = releaseRail.getBoundingClientRect();
    const cardRect = active.getBoundingClientRect();
    const inset = 6;
    let delta = 0;
    if (cardRect.left < railRect.left + inset) delta = cardRect.left - railRect.left - inset;
    else if (cardRect.right > railRect.right - inset) delta = cardRect.right - railRect.right + inset;
    if (Math.abs(delta) < 1) return;
    releaseRail.scrollTo({
      left: Math.max(0, releaseRail.scrollLeft + delta),
      behavior: reduced.matches ? 'auto' : 'smooth',
    });
  }

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function syncDetailState() {
    syncQueued = false;
    const cards = [...releaseRail.querySelectorAll('.release-card')];
    const active = cards.find((card) => card.classList.contains('active')) || null;
    const hasActiveRelease = Boolean(active);
    detail.dataset.releaseFilter = hasActiveRelease ? 'true' : 'false';
    showAll.hidden = !hasActiveRelease;
    setText(showAll, 'All songs');
    showAll.setAttribute('aria-label', 'Show all songs in this catalogue');
    const nextEyebrow = hasActiveRelease ? 'Selected release' : 'Songs';
    if (songsEyebrow.textContent !== nextEyebrow) {
      songsEyebrow.textContent = nextEyebrow;
    }

    cards.forEach((card) => {
      if (card === active) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
    });

    if (active) {
      const context = active.querySelector('.release-meta')?.textContent?.trim() || '';
      setText(selectedContext, context);
      selectedContext.hidden = !context;
      requestAnimationFrame(() => revealActiveRelease(active));
    } else {
      setText(selectedContext, '');
      selectedContext.hidden = true;
    }
  }

  function queueSyncDetailState() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(syncDetailState);
  }

  new MutationObserver(queueSyncDetailState).observe(releaseRail, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  new MutationObserver(queueSyncDetailState).observe(songsSection, { childList: true, subtree: true });
  window.addEventListener('popstate', () => queueMicrotask(queueSyncDetailState));
  window.addEventListener('pageshow', queueSyncDetailState);
  queueSyncDetailState();
})();