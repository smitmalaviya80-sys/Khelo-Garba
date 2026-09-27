(() => {
  const nativeFetch = window.fetch.bind(window);
  const bootGenres = [{"id":"traditional","name":"Traditional","label":"Traditional Garba","background":"assets/backgrounds/traditional.svg","accent":"#d6b06f"},{"id":"dandiya","name":"Dandiya","label":"Dandiya Raas","background":"assets/backgrounds/dandiya.svg","accent":"#a77ad6"},{"id":"devotional","name":"Devotional","label":"Devotional Garba","background":"assets/backgrounds/devotional.svg","accent":"#c78372"},{"id":"folk","name":"Folk","label":"Gujarati Folk","background":"assets/backgrounds/folk.svg","accent":"#9a9fc7"},{"id":"sanedo","name":"Sanedo","label":"Sanedo","background":"assets/backgrounds/sanedo.svg","accent":"#c99872"},{"id":"fusion","name":"Fusion","label":"Modern Fusion Garba","background":"assets/backgrounds/fusion.svg","accent":"#a78bc4"}];
  const bootSongs = [{"id":"ochhav-2023-01-ochhav-theme","title":"Ochhav Theme","artist":"Aditya Gadhvi","genre":"traditional","durationSeconds":79,"youtubeId":"V4f5I_xJVoA","youtubeStartSeconds":0,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=V4f5I_xJVoA","playbackSourceType":"official-artist-channel"},{"id":"atul-maro-garbo-2000-10-haiye-rakhi-hom","title":"Haiye Rakhi Hom","artist":"Atul Purohit, Himali & Smita Shah","genre":"traditional","durationSeconds":184,"youtubeId":"wJZLxRx3ymc","youtubeStartSeconds":1166,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=wJZLxRx3ymc","playbackSourceType":"verified-performance-chapter"},{"id":"atul-maro-garbo-2000-12-fagan-foramto-aayo","title":"Fagan Foramto Aayo","artist":"Atul Purohit, Himali & Smita Shah","genre":"traditional","durationSeconds":228,"youtubeId":"wJZLxRx3ymc","youtubeStartSeconds":1453,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=wJZLxRx3ymc","playbackSourceType":"verified-performance-chapter"},{"id":"khelaiya-disco-dandia-93-1993-04-dholida-dhol-re-vagad","title":"Dholida Dhol Re Vagad","artist":"Rupal Doshi","genre":"dandiya","durationSeconds":481,"youtubeId":"RKDi5F85ft4","youtubeStartSeconds":1721,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=RKDi5F85ft4","playbackSourceType":"verified-performance-chapter"},{"id":"ramzat-45-1995-01-ramzat-45-non-stop-raas-garba","title":"Ramzat 45 Non Stop Raas Garba","artist":"Anuradha Paudwal, Praful Dave, Sonu Nigam, Mina Patel, Sanjay Ojha, Aarti Munshi & Gaurang Vyas","genre":"dandiya","playbackProvider":"apple-music","playbackSourceUrl":"https://music.apple.com/us/album/ramzat-45-non-stop-raas-garba/1251277246","playbackSourceType":"verified-single-release-source"},{"id":"bollywood-dandiya-2014-01-non-stop-bollywood-dandiya-garbe-ki-raat-hai-2014","title":"Non Stop Bollywood Dandiya Garbe Ki Raat Hai 2014","artist":"Pankaj Bhatt","genre":"dandiya","playbackProvider":"apple-music","playbackSourceUrl":"https://music.apple.com/us/album/non-stop-bollywood-dandiya-garbe-ki-raat-hai-2014/1194845614","playbackSourceType":"verified-single-release-source"},{"id":"shyam-raas-v3-1998-01-chhand","title":"Chhand","artist":"Hemant Chauhan","genre":"devotional","durationSeconds":78,"youtubeId":"ZnqLyzreCF8","youtubeStartSeconds":31,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=ZnqLyzreCF8","playbackSourceType":"verified-performance-chapter"},{"id":"re-lol-vol7-2000-01-chhand","title":"Chhand","artist":"Various Artists","genre":"devotional","durationSeconds":93,"youtubeId":"ZnqLyzreCF8","youtubeStartSeconds":31,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=ZnqLyzreCF8","playbackSourceType":"verified-performance-chapter"},{"id":"anand-vol8-2001-14-ghor-andhari-re","title":"Ghor Andhari Re","artist":"Musa Paik & Pamela Jain","genre":"devotional","durationSeconds":225,"youtubeId":"V4f5I_xJVoA","youtubeStartSeconds":2518,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=V4f5I_xJVoA","playbackSourceType":"verified-performance-chapter"},{"id":"he-ranglo-jamyo-1962-01-he-ranglo-jamyo","title":"He Ranglo Jamyo","artist":"Asha Bhosle & Ashit Desai","genre":"folk","playbackProvider":"apple-music","playbackSourceUrl":"https://music.apple.com/us/song/1424893548","playbackSourceType":"verified-track-source"},{"id":"diwaliben-koyal-digital-01-koyal-bethi-aambaliya-ni-dal","title":"Koyal Bethi Aambaliya Ni Dal","artist":"Diwaliben Bhil","genre":"folk","playbackProvider":"apple-music","playbackSourceUrl":"https://music.apple.com/us/song/1566136266","playbackSourceType":"verified-track-source"},{"id":"charan-kanya-aditya-gadhvi-2022","title":"Charan Kanya - Swarotsav 2019","artist":"Aditya Gadhvi","genre":"folk","youtubeId":"Tu9cLEYEvoc","playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=Tu9cLEYEvoc","playbackSourceType":"official-artist-channel"},{"id":"sanedo-sanedo-2007-01-rang-pichkari","title":"Rang Pichkari","artist":"Achal Maheta, Sargam Vyash, Ansh Maheta, Shilpa Aiyyar, Piyush Parmar & Pratiksha Desai","genre":"sanedo","playbackProvider":"apple-music","playbackSourceUrl":"https://music.apple.com/us/album/sanedo-sanedo/581651148","playbackSourceType":"verified-release-source"},{"id":"sanedo-sanedo-2007-02-poonam-ni-raat","title":"Poonam Ni Raat","artist":"Achal Maheta, Sargam Vyash, Ansh Maheta, Shilpa Aiyyar, Piyush Parmar & Pratiksha Desai","genre":"sanedo","playbackProvider":"apple-music","playbackSourceUrl":"https://music.apple.com/us/album/sanedo-sanedo/581651148","playbackSourceType":"verified-release-source"},{"id":"sanedo-sanedo-2007-03-ashmani-rang-ni-chundani","title":"Ashmani Rang Ni Chundani","artist":"Achal Maheta, Sargam Vyash, Ansh Maheta, Shilpa Aiyyar, Piyush Parmar & Pratiksha Desai","genre":"sanedo","playbackProvider":"apple-music","playbackSourceUrl":"https://music.apple.com/us/album/sanedo-sanedo/581651148","playbackSourceType":"verified-release-source"},{"id":"ho-raj-fusion-2001-01-ho-raj-ho-raj","title":"Ho Raj Ho Raj","artist":"Manoj Dave & Forum Mehta","genre":"fusion","durationSeconds":66,"playbackProvider":"spotify","playbackSourceUrl":"https://open.spotify.com/track/0GDjX03Yvagc1uYY27saCB","playbackSourceType":"verified-track-source"},{"id":"ho-raj-fusion-2001-02-ghor-andhari-re","title":"Ghor Andhari Re","artist":"Forum Mehta","genre":"fusion","durationSeconds":158,"youtubeId":"V4f5I_xJVoA","youtubeStartSeconds":2518,"playbackProvider":"youtube","playbackSourceUrl":"https://www.youtube.com/watch?v=V4f5I_xJVoA","playbackSourceType":"verified-performance-chapter"},{"id":"ho-raj-fusion-2001-03-ho-raj-re-mavdi-na-garabe","title":"Ho Raj Re Mavdi Na Garabe","artist":"Manoj Dave & Forum Mehta","genre":"fusion","durationSeconds":279,"playbackProvider":"spotify","playbackSourceUrl":"https://open.spotify.com/track/0GDjX03Yvagc1uYY27saCB","playbackSourceType":"verified-track-source"}].map((song) => ({
    ...song,
    playbackReady: Boolean(
      !song.audioUrl
      && !song.playbackSearchOnly
      && song.playbackSourceType !== 'verified-release-track-reference'
      && song.playbackSourceType !== 'verified-unchaptered-youtube-release'
      && song.youtubeId
      && (song.playbackProvider === 'youtube' || /youtu(?:\.be|be\.com)/i.test(String(song.playbackSourceUrl || '')))
    ),
  }));
  let hydratePromise = null;
  let hydrated = false;

  function requestPath(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return raw ? new URL(raw, location.href).pathname : '';
    } catch {
      return '';
    }
  }

  function localJson(data) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json; charset=utf-8' }),
      async json() { return data; },
      async text() { return JSON.stringify(data); },
      clone() { return localJson(data); },
    };
  }

  window.fetch = (input, init) => {
    const path = requestPath(input);
    if (path.endsWith('/data/genres.json')) return Promise.resolve(localJson(bootGenres));
    if (path.endsWith('/data/songs.json')) return Promise.resolve(localJson(bootSongs));
    return nativeFetch(input, init);
  };

  try {
    const cachedSongs = sessionStorage.getItem('garba:boot_songs');
    const cachedGenres = sessionStorage.getItem('garba:boot_genres');
    if (cachedSongs && cachedGenres) {
      const parsedSongs = JSON.parse(cachedSongs);
      const parsedGenres = JSON.parse(cachedGenres);
      if (Array.isArray(parsedSongs) && parsedSongs.length > 50 && Array.isArray(parsedGenres) && parsedGenres.length > 0) {
        bootGenres.splice(0, bootGenres.length, ...parsedGenres);
        bootSongs.splice(0, bootSongs.length, ...parsedSongs);
        hydrated = true;
        window.GARBA_CATALOGUE_READY = true;
      }
    }
  } catch {
    // Ignore cache read failures
  }

  async function hydrate() {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        const [genresResponse, songsResponse] = await Promise.all([
          nativeFetch('data/genres.json', { cache: 'default' }),
          nativeFetch('data/songs.json', { cache: 'default' }),
        ]);
        if (!genresResponse.ok || !songsResponse.ok) throw new Error('Full catalogue request failed');
        const [genres, songs] = await Promise.all([genresResponse.json(), songsResponse.json()]);
        if (!Array.isArray(genres) || !Array.isArray(songs) || !songs.length) throw new Error('Full catalogue is invalid');

        bootGenres.splice(0, bootGenres.length, ...genres);
        bootSongs.splice(0, bootSongs.length, ...songs);
        hydrated = true;
        try {
          sessionStorage.setItem('garba:boot_songs', JSON.stringify(songs));
          sessionStorage.setItem('garba:boot_genres', JSON.stringify(genres));
        } catch {
          // Ignore cache write failures
        }
        window.GARBA_CATALOGUE_READY = true;
        window.dispatchEvent(new CustomEvent('garba:catalogue-ready', { detail: { songs: songs.length } }));
        window.dispatchEvent(new Event('online'));
        return true;
      } catch (error) {
        console.warn('GARBA full catalogue will retry on demand; fast catalogue remains active.', error);
        hydratePromise = null;
        return false;
      }
    })();
    return hydratePromise;
  }

  function scheduleHydration() {
    const run = () => hydrate();
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2600 });
    else setTimeout(run, 1800);
  }

  window.GARBA_FAST_BOOT = {
    genres: bootGenres,
    songs: bootSongs,
    hydrate,
    get hydrated() { return hydrated; },
  };

  if (document.readyState === 'complete') scheduleHydration();
  else window.addEventListener('load', scheduleHydration, { once: true });
})();

(() => {
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const songTitle = $('songTitle');
  const songArtist = $('songArtist');
  const shareButton = $('shareButton');
  const queueButton = $('queueButton');
  const queueBadge = $('queueBadge');
  const favouriteButton = $('mobileFavourite');
  const elapsedTime = $('elapsedTime');
  const durationTime = $('durationTime');
  const progress = $('progress');
  const songSheet = $('songSheet');
  const sheetClose = $('sheetClose');
  const topbar = document.querySelector('.topbar');
  const mainPlayer = $('mainPlayer');
  const installBanner = $('installBanner');
  const networkStatus = $('networkStatus');
  const toast = $('toast');

  let toastTimer = null;
  let sheetModalActive = false;

  function cleanText(value = '') {
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function announce(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function isInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest(
      'button, a[href], input, textarea, select, summary, iframe, [contenteditable="true"], [role="button"], [role="link"], [role="slider"], [role="textbox"]'
    ));
  }

  function isPlayerShortcut(event) {
    if (event.code === 'Space' || event.code === 'ArrowLeft' || event.code === 'ArrowRight') return true;
    if (event.key === '/') return true;
    const key = String(event.key || '').toLowerCase();
    return key === 'f' || key === 's' || key === 'l';
  }

  function sheetIsOpen() {
    return songSheet?.getAttribute('aria-hidden') === 'false';
  }

  function copyTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    textarea.remove();
    return copied;
  }

  async function shareCurrentTrack() {
    const title = cleanText(songTitle?.textContent) || 'PlayGarba';
    const artist = cleanText(songArtist?.textContent);
    const url = new URL(location.href);
    url.searchParams.delete('source');
    url.searchParams.delete('browse');
    const text = artist ? `${title} by ${artist}` : title;

    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} · PlayGarba`, text, url: url.toString() });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        announce('Track link copied.');
        return;
      }
      if (copyTextFallback(url.toString())) {
        announce('Track link copied.');
        return;
      }
      announce('Could not copy this track link.');
    } catch (error) {
      if (error?.name !== 'AbortError') announce('Could not share this track.');
    }
  }

  function syncControlLabels() {
    const title = cleanText(songTitle?.textContent) || 'current song';
    const artist = cleanText(songArtist?.textContent);
    const saved = favouriteButton?.getAttribute('aria-pressed') === 'true';

    if (shareButton) {
      shareButton.setAttribute('aria-label', `Share ${title}`);
      shareButton.setAttribute('aria-keyshortcuts', 'Shift+S');
      shareButton.title = artist ? `Share ${title} by ${artist}` : `Share ${title}`;
    }
    if (favouriteButton) {
      favouriteButton.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${title} ${saved ? 'from' : 'to'} My Garba`);
    }
    if (queueButton) {
      const badge = cleanText(queueBadge?.textContent);
      queueButton.setAttribute('aria-label', badge ? `Open Up next, ${badge} songs shown` : 'Open Up next');
    }
    if (progress) {
      const elapsed = cleanText(elapsedTime?.textContent) || '0:00';
      const duration = cleanText(durationTime?.textContent) || '--:--';
      progress.setAttribute('aria-valuetext', `${elapsed} of ${duration}`);
    }
  }

  function setBackgroundInert(inert) {
    for (const element of [topbar, mainPlayer, installBanner]) {
      if (!element) continue;
      if (inert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    }
  }

  function visibleFocusable(root) {
    return [...root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((node) => node.getClientRects().length > 0 && !node.closest('[hidden]'));
  }

  function syncSheetModal() {
    if (!songSheet) return;
    const modal = sheetIsOpen() && songSheet.getAttribute('aria-modal') === 'true';
    if (modal === sheetModalActive) return;
    sheetModalActive = modal;
    setBackgroundInert(modal);

    if (modal && !songSheet.contains(document.activeElement)) {
      requestAnimationFrame(() => {
        const preferred = sheetClose || visibleFocusable(songSheet)[0];
        preferred?.focus?.({ preventScroll: true });
      });
    }
  }

  function trapSheetTab(event) {
    if (event.key !== 'Tab' || !sheetModalActive || !songSheet) return;
    const focusable = visibleFocusable(songSheet);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function syncNetworkStatus() {
    if (!networkStatus) return;
    const offline = navigator.onLine === false;
    networkStatus.textContent = offline ? 'Offline' : '';
    networkStatus.classList.toggle('show', offline);
    networkStatus.setAttribute('aria-hidden', String(!offline));
  }

  function syncPageActivity() {
    app?.classList.toggle('page-hidden', document.hidden);
  }

  function syncConnectionPreference() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const constrained = Boolean(connection?.saveData) || /(^|-)2g$/.test(String(connection?.effectiveType || ''));
    if (constrained) app?.setAttribute('data-save-data', 'true');
    else app?.removeAttribute('data-save-data');
  }

  function setupKeyboardGuard() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sheetIsOpen() && songSheet?.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        sheetClose?.click();
        return;
      }
      if (String(event.key || '').toLowerCase() === 's' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        shareCurrentTrack();
        return;
      }
      if (!isPlayerShortcut(event)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || isInteractiveTarget(event.target)) event.stopImmediatePropagation();
    });
  }

  function setupObservers() {
    const metadataObserver = new MutationObserver(syncControlLabels);
    for (const element of [songTitle, songArtist, queueBadge, elapsedTime, durationTime]) {
      if (element) metadataObserver.observe(element, { childList: true, characterData: true, subtree: true });
    }
    if (favouriteButton) metadataObserver.observe(favouriteButton, { attributes: true, attributeFilter: ['aria-pressed'] });
    if (songSheet) {
      const sheetObserver = new MutationObserver(syncSheetModal);
      sheetObserver.observe(songSheet, { attributes: true, attributeFilter: ['aria-hidden', 'aria-modal', 'data-snap', 'class'] });
      songSheet.addEventListener('keydown', trapSheetTab);
    }
  }

  shareButton?.addEventListener('click', shareCurrentTrack);
  window.addEventListener('online', syncNetworkStatus);
  window.addEventListener('offline', syncNetworkStatus);
  document.addEventListener('visibilitychange', syncPageActivity);
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  connection?.addEventListener?.('change', syncConnectionPreference);
  setupKeyboardGuard();
  setupObservers();
  syncControlLabels();
  syncNetworkStatus();
  syncPageActivity();
  syncConnectionPreference();
  syncSheetModal();
})();

document.write('<script src="provider-runtime.js"><\/script><script src="player-continuity.js"><\/script><script src="youtube-player-runtime.js"><\/script>');
