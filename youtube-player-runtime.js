(() => {
  const $ = (id) => document.getElementById(id);
  const audio = $('audio');
  const playButton = $('playButton');
  const miniPlay = $('miniPlay');
  const progress = $('progress');
  const elapsedTime = $('elapsedTime');
  const durationTime = $('durationTime');
  const miniProgress = $('miniProgress');
  const songTitle = $('songTitle');
  const songArtist = $('songArtist');

  let apiPromise = null;
  let safeSongs = [];
  let safeSongsPromise = null;
  let player = null;
  let playerReadyPromise = null;
  let playerReadyReject = null;
  let playerGeneration = 0;
  let activeRequestGeneration = 0;
  let activeVideoId = '';
  let activeSong = null;
  let baseStart = 0;
  let trackDuration = 0;
  let playerState = -1;
  let pollTimer = null;
  let openToken = 0;
  let continueAfterNavigation = false;
  let lastPersistedSecond = -1;
  let lastMediaSessionPositionKey = '';
  let advanceLock = false;
  let bypassNextPlay = false;
  let retryCount = 0;
  let startOverride = null;
  const MAX_RECOVERY_RETRIES = 2;

  const states = () => window.YT?.PlayerState || { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

  function formatTime(seconds = 0) {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  function bootSongs() {
    return Array.isArray(window.GARBA_FAST_BOOT?.songs) ? window.GARBA_FAST_BOOT.songs : [];
  }

  function currentSongFrom(songs) {
    if (window.GARBA_APP?.getCurrentSong) {
      const appSong = window.GARBA_APP.getCurrentSong();
      if (appSong?.id) {
        const found = songs.find((song) => song.id === appSong.id);
        if (found) return found;
        if (appSong.youtubeId) return appSong;
      }
    }
    const songId = songTitle?.dataset?.songId || new URL(location.href).searchParams.get('song');
    if (songId) {
      const found = songs.find((song) => song.id === songId);
      if (found) return found;
    }
    const title = String(songTitle?.textContent || '').trim();
    const artist = String(songArtist?.textContent || '').trim();
    return songs.find((song) => song.title === title && song.artist === artist) || null;
  }

  function currentSafeSong() {
    return currentSongFrom(safeSongs);
  }

  // Tracks cut from one long recording (a nonstop album on one YouTube video) share its video. A track with no
  // duration of its own runs until the next track in that video starts.
  let slicesFor = null;
  let slicesIndex = new Map();
  function laterSliceStart(song, id, start) {
    if (slicesFor !== safeSongs) {
      slicesFor = safeSongs;
      slicesIndex = new Map();
      for (const entry of safeSongs) {
        if (!entry?.youtubeId || !(Number(entry.youtubeStartSeconds) >= 0)) continue;
        const key = String(entry.youtubeId).trim();
        if (!slicesIndex.has(key)) slicesIndex.set(key, []);
        slicesIndex.get(key).push(Number(entry.youtubeStartSeconds));
      }
    }
    const starts = slicesIndex.get(id) || [];
    let next = Infinity;
    for (const value of starts) if (value > start + 1 && value < next) next = value;
    return Number.isFinite(next) ? next : null;
  }

  // How long a track plays. A cut from a longer recording runs exactly to where the next cut starts, whatever length
  // the catalogue gives it, so no audio is skipped and none repeats; together the cuts play as one recording. A song
  // that is the whole programme (its length runs well past the next cut) keeps its full length.
  function trackLength(song, next, start) {
    const stored = Math.max(0, Number(song.durationSeconds || 0));
    if (!next) return stored;
    const gap = next - start;
    return stored > gap + 60 ? stored : gap;
  }

  // Fades between different recordings: the last ten seconds fade out, and the next song fades in over its first
  // ten seconds (four when the listener picked it). The level follows the playback position, so seeking stays right.
  // Cuts of one recording run straight on. Browsers that don't allow a page to set the level (iPhone) play at full.
  const FADE_SECONDS = 10;
  let fadeInSeconds = 0;
  let fadeOutTail = true;
  let nextOpenIsAuto = false;
  let lastVolume = -1;
  function applyFade(current, total) {
    if (!player?.setVolume) return;
    let level = 1;
    if (fadeInSeconds > 0 && current < fadeInSeconds) level = Math.min(level, Math.max(0, current / fadeInSeconds));
    if (fadeOutTail && total > FADE_SECONDS * 2) {
      const left = total - current;
      if (left < FADE_SECONDS) level = Math.min(level, Math.max(0, left / FADE_SECONDS));
    }
    const volume = Math.round(level * 100);
    if (volume === lastVolume) return;
    lastVolume = volume;
    try { player.setVolume(volume); } catch { /* level control is optional */ }
  }

  function currentBootSong() {
    return currentSongFrom(bootSongs());
  }

  function videoId(song) {
    if (song?.youtubeId) return String(song.youtubeId).trim();
    try {
      const url = new URL(String(song?.playbackSourceUrl || ''));
      if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
      if (url.hostname.includes('youtube.com')) {
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex((part) => part === 'embed' || part === 'shorts');
        return marker >= 0 ? parts[marker + 1] || '' : '';
      }
    } catch {
      // Invalid URLs are unavailable playback routes.
    }
    return '';
  }

  function youtubeCandidate(song) {
    if (!song || song.audioUrl) return false;
    const provider = String(song.playbackProvider || '').toLowerCase();
    return Boolean(song.youtubeId || provider === 'youtube' || /youtu(?:\.be|be\.com)/i.test(String(song.playbackSourceUrl || '')));
  }

  function canControl(song) {
    if (!youtubeCandidate(song) || song.playbackSearchOnly) return false;
    if (song.playbackSourceType === 'verified-unchaptered-youtube-release') return false;
    return Boolean(videoId(song));
  }

  function loadSafeSongs({ refresh = false } = {}) {
    if (safeSongsPromise && !refresh) return safeSongsPromise;
    safeSongsPromise = fetch('data/songs.json', { cache: refresh ? 'no-store' : 'force-cache' })
      .then((response) => response.ok ? response.json() : [])
      .then((songs) => {
        safeSongs = Array.isArray(songs) ? songs : [];
        return safeSongs;
      })
      .catch(() => safeSongs)
      .finally(() => { safeSongsPromise = null; });
    return safeSongsPromise;
  }

  function setRecoveryActions({ retry = false, choose = false, open = true } = {}) {
    const retryButton = $('youtubeDockRetry');
    const chooseButton = $('youtubeDockChoose');
    const openLink = $('youtubeDockOpen');
    if (retryButton) {
      retryButton.hidden = !retry;
      retryButton.disabled = false;
    }
    if (chooseButton) chooseButton.hidden = !choose;
    if (openLink) openLink.hidden = !open;
  }

  function ensureStage() {
    let stage = $('youtubeStage');
    if (stage) return stage;
    stage = document.createElement('section');
    stage.id = 'youtubeStage';
    stage.className = 'provider-dock is-youtube-release youtube-dock';
    stage.setAttribute('aria-label', 'YouTube playback');
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = `
      <div class="provider-media youtube-provider-media" id="youtubeProviderMedia"></div>
      <div class="provider-dock-bar">
        <span id="youtubeDockNote" role="status" aria-live="polite">YouTube · ready</span>
        <div class="provider-dock-actions">
          <button type="button" id="youtubeDockRetry" hidden>Retry</button>
          <a id="youtubeDockOpen" class="provider-dock-open" target="_blank" rel="noopener noreferrer">Open YouTube</a>
          <button type="button" id="youtubeDockChoose" hidden>Choose another recording</button>
          <button type="button" id="youtubeDockStop" aria-label="Close YouTube playback">Close</button>
        </div>
      </div>`;
    document.body.append(stage);
    $('youtubeDockRetry')?.addEventListener('click', retryActive);
    $('youtubeDockChoose')?.addEventListener('click', chooseAnother);
    $('youtubeDockStop')?.addEventListener('click', () => close());
    return stage;
  }

  function setNote(message, { loading = false, needsTap = false, assertive = false, recovery = false } = {}) {
    const stage = ensureStage();
    const note = $('youtubeDockNote');
    if (note) {
      note.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
      if (note.textContent !== message) note.textContent = message;
    }
    stage.classList.toggle('is-loading', loading);
    stage.classList.toggle('needs-tap', needsTap);
    if (recovery) stage.dataset.recovery = 'true';
    else {
      delete stage.dataset.recovery;
      setRecoveryActions({ open: true });
    }
  }

  function showRecovery(message, { retry = true, choose = true, open = true, needsTap = true } = {}) {
    setNote(message, { needsTap, assertive: true, recovery: true });
    setRecoveryActions({ retry: retry && retryCount < MAX_RECOVERY_RETRIES, choose, open });
  }

  function prepareStageForSong(song, id) {
    const stage = ensureStage();
    const openLink = $('youtubeDockOpen');
    stage.classList.add('open');
    stage.setAttribute('aria-hidden', 'false');
    if (openLink) {
      openLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
      openLink.setAttribute('aria-label', `Open ${song.title} on YouTube`);
    }
    return stage;
  }

  function retryActive() {
    const song = activeSong;
    const songId = song?.id;
    const generation = activeRequestGeneration;
    if (!song || !canControl(song) || retryCount >= MAX_RECOVERY_RETRIES) return false;
    retryCount += 1;
    const retryButton = $('youtubeDockRetry');
    if (retryButton) retryButton.disabled = true;
    queueMicrotask(() => {
      if (activeSong?.id !== songId || activeRequestGeneration !== generation) return;
      open(song, { autoplay: true, resume: true, retry: true });
    });
    return true;
  }

  function chooseAnother() {
    if (!activeSong) return false;
    continueAfterNavigation = true;
    advanceLock = false;
    $('nextButton')?.click();
    return true;
  }

  function setPlaying(playing) {
    $('app')?.classList.toggle('is-playing', playing);
    for (const button of [playButton, miniPlay]) {
      if (!button) continue;
      button.classList.toggle('is-playing', playing);
      button.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      button.title = playing ? 'Pause' : 'Play';
    }
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch {
      // Some webviews expose Media Session only partially.
    }
    window.dispatchEvent(new CustomEvent('garba:playback-state-change', {
      detail: Object.freeze({ playing, songId: activeSong?.id || null }),
    }));
  }

  function setProgressState(current = 0, total = 0) {
    const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
    const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
    const ratio = safeTotal > 0 ? Math.min(1, Math.max(0, safeCurrent / safeTotal)) : 0;
    const progressValue = Math.round(ratio * 1000);
    const progressPercent = `${progressValue / 10}%`;

    if (progress) {
      if (String(progress.value) !== String(progressValue)) progress.value = String(progressValue);
      if (progress.style.getPropertyValue('--progress') !== progressPercent) {
        progress.style.setProperty('--progress', progressPercent);
      }
    }

    const elapsedLabel = formatTime(safeCurrent);
    if (elapsedTime && elapsedTime.textContent !== elapsedLabel) elapsedTime.textContent = elapsedLabel;

    const durationLabel = formatTime(safeTotal);
    if (durationTime && durationTime.textContent !== durationLabel) durationTime.textContent = durationLabel;

    if (miniProgress && miniProgress.style.width !== progressPercent) miniProgress.style.width = progressPercent;
  }

  function resetPlaybackState(song, id, generation, { resume = true } = {}) {
    activeRequestGeneration = generation;
    activeVideoId = id;
    const logicalStart = takeStartOverride(song) ?? (resume ? restoreElapsed(song) : 0);
    setPlaying(false);
    setProgressState(logicalStart, Math.max(0, Number(song?.durationSeconds || 0)));
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.setPositionState();
    } catch {
      // Clearing stale position state is optional in partial Media Session implementations.
    }
    window.dispatchEvent(new CustomEvent('garba:youtube-selection-reset', {
      detail: Object.freeze({ generation, songId: song?.id || null, videoId: id, position: logicalStart }),
    }));
    return logicalStart;
  }

  function providerEventIsCurrent(event, generation, expectedPlayer) {
    if (generation !== playerGeneration || expectedPlayer !== player || event?.target !== expectedPlayer) return false;
    if (!activeSong || !activeVideoId) return false;
    let observedVideoId = '';
    try { observedVideoId = String(expectedPlayer.getVideoData?.().video_id || '').trim(); }
    catch { return false; }
    return Boolean(observedVideoId) && observedVideoId === activeVideoId;
  }

  function takeStartOverride(song) {
    const override = startOverride;
    startOverride = null;
    if (!override || override.songId !== song?.id) return null;
    const max = Number(song.durationSeconds || 0);
    return max > 0 ? Math.min(override.seconds, Math.max(0, max - 0.5)) : override.seconds;
  }

  function elapsed() {
    if (!player || !activeSong) return 0;
    try { return Math.max(0, Number(player.getCurrentTime?.() || 0) - baseStart); }
    catch { return 0; }
  }

  function duration() {
    if (trackDuration > 0) return trackDuration;
    try {
      const full = Number(player?.getDuration?.() || 0);
      return full > baseStart ? full - baseStart : 0;
    } catch {
      return 0;
    }
  }

  function persistNonstopResume(positionSeconds, completed = false) {
    if (!activeSong?.id?.startsWith('nonstop:')) return;
    const setId = activeSong.nonstopSetId || activeSong.id.slice(8);
    const video = activeVideoId || videoId(activeSong);
    if (!setId || !video) return;
    const sourceIdentity = `youtube:${video}`;
    const total = duration() || trackDuration || null;
    try {
      const raw = localStorage.getItem('garba:nonstop-resume:v1');
      let entries = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.version === 1 && Array.isArray(parsed.entries)) {
            entries = parsed.entries.filter((e) => e && typeof e.setId === 'string' && typeof e.sourceIdentity === 'string');
          }
        } catch { /* corrupt storage cleared */ }
      }
      if (completed) {
        const remaining = entries.filter((e) => e.setId !== setId);
        localStorage.setItem('garba:nonstop-resume:v1', JSON.stringify({ version: 1, entries: remaining }));
        return;
      }
      const existing = entries.find((e) => e.setId === setId);
      if (existing && existing.sourceIdentity !== sourceIdentity) return;
      const record = {
        setId,
        sourceIdentity,
        positionSeconds: Math.max(0, Math.round(positionSeconds || 0)),
        durationSeconds: total && total > 0 ? Math.round(total) : null,
        updatedAtMs: Date.now(),
        ...(activeSong.title ? { title: String(activeSong.title).trim() } : {}),
        ...(activeSong.artist ? { artist: String(activeSong.artist).trim() } : {}),
      };
      const nextEntries = [record, ...entries.filter((e) => e.setId !== setId)].slice(0, 8);
      localStorage.setItem('garba:nonstop-resume:v1', JSON.stringify({ version: 1, entries: nextEntries }));
    } catch {
      // Storage can be denied in private browsing.
    }
  }

  function persistPosition(current) {
    const rounded = Math.round(current || 0);
    if (rounded === lastPersistedSecond || rounded % 5 !== 0) return;
    lastPersistedSecond = rounded;
    try {
      const previous = JSON.parse(localStorage.getItem('garba:session') || '{}');
      localStorage.setItem('garba:session', JSON.stringify({
        ...previous,
        genreId: String($('app')?.dataset.genre || previous.genreId || ''),
        songId: activeSong?.id || previous.songId || null,
        elapsed: rounded,
      }));
    } catch {
      // Storage can be denied in private browsing.
    }
    persistNonstopResume(rounded, false);
  }

  function syncProgress(expectedRequestGeneration = activeRequestGeneration) {
    if (expectedRequestGeneration !== activeRequestGeneration || !player || !activeSong) return;
    if (typeof player.getVideoData === 'function') {
      let observedVideoId = '';
      try { observedVideoId = String(player.getVideoData()?.video_id || '').trim(); }
      catch { return; }
      if (!observedVideoId || observedVideoId !== activeVideoId) return;
    }
    const current = elapsed();
    const total = duration();
    setProgressState(current, total);
    applyFade(current, total);
    persistPosition(current);

    if ('mediaSession' in navigator && total > 0) {
      try {
        const playbackRate = Number(player.getPlaybackRate?.() || 1);
        const position = Math.min(Math.max(0, current), total);
        const positionKey = `${Math.max(1, total)}:${playbackRate}:${Math.floor(position)}`;
        if (positionKey !== lastMediaSessionPositionKey) {
          navigator.mediaSession.setPositionState({
            duration: Math.max(1, total),
            playbackRate,
            position,
          });
          lastMediaSessionPositionKey = positionKey;
        }
      } catch {
        // Position state is optional.
      }
    }

    if (trackDuration > 0 && playerState === states().PLAYING && current >= trackDuration - 0.3) advance();
  }

  function startPolling(expectedRequestGeneration = activeRequestGeneration) {
    clearInterval(pollTimer);
    pollTimer = setInterval(syncProgress, 350);
    syncProgress(expectedRequestGeneration);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function constrainedConnection() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return false;
    if (connection.saveData) return true;
    const effectiveType = String(connection.effectiveType || '').toLowerCase();
    return effectiveType === 'slow-2g' || effectiveType === '2g';
  }

  function prepareApiFromPlaybackIntent(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#playButton, #miniPlay')) return;
    if (navigator.onLine === false || constrainedConnection()) return;
    if (audio?.getAttribute('src')) return;
    const song = currentSafeSong() || currentBootSong();
    if (!canControl(song)) return;
    loadApi().catch(() => null);
  }

  function loadApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;

    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error('YT.Player unavailable'));
      };

      window.onYouTubeIframeAPIReady = () => {
        try { previous?.(); } catch { /* another consumer should not block GARBA */ }
        finish();
      };

      let script = document.querySelector('script[data-garba-youtube-api="true"]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.garbaYoutubeApi = 'true';
        script.addEventListener('error', () => reject(new Error('YouTube IFrame API failed to load')), { once: true });
        document.head.append(script);
      }

      setTimeout(() => {
        if (!settled && !window.YT?.Player) reject(new Error('YouTube IFrame API timed out'));
      }, 12000);
    }).catch((error) => {
      apiPromise = null;
      throw error;
    });

    return apiPromise;
  }

  function closeGenericProvider() {
    document.querySelector('#providerStage.open[aria-hidden="false"] #providerDockStop')?.click();
  }

  function handlePlayerStateChange(event, generation, expectedPlayer) {
    if (!providerEventIsCurrent(event, generation, expectedPlayer)) return;
    const requestGeneration = activeRequestGeneration;
    playerState = Number(event.data);
    const s = states();
    if (playerState === s.PLAYING) {
      retryCount = 0;
      setPlaying(true);
      setNote('YouTube · playing in GARBA');
      startPolling(requestGeneration);
    } else if (playerState === s.BUFFERING) {
      setNote('YouTube · buffering', { loading: true });
      startPolling(requestGeneration);
    } else if (playerState === s.PAUSED || playerState === s.CUED) {
      setPlaying(false);
      setNote(playerState === s.CUED ? 'YouTube · ready' : 'YouTube · paused');
      syncProgress(requestGeneration);
    } else if (playerState === s.ENDED) {
      setPlaying(false);
      syncProgress(requestGeneration);
      persistNonstopResume(elapsed(), true);
      advance();
    }
  }

  function handleAutoplayBlocked(event, generation, expectedPlayer) {
    if (!providerEventIsCurrent(event, generation, expectedPlayer)) return;
    setPlaying(false);
    stopPolling();
    showRecovery('Playback is ready. Tap Play to start this recording.', { retry: false, choose: true, open: true, needsTap: true });
  }

  function handlePlayerError(event, generation, expectedPlayer) {
    if (!providerEventIsCurrent(event, generation, expectedPlayer)) return;
    setPlaying(false);
    stopPolling();
    const code = Number(event.data || 0);
    const token = openToken;
    window.dispatchEvent(new CustomEvent('garba:youtube-error', {
      detail: Object.freeze({ code, songId: activeSong?.id || null }),
    }));
    // A listener (Garba Circle) may already have opened a replacement; keep its dock state.
    if (token !== openToken) return;
    if (code === 101 || code === 150) {
      showRecovery('This recording cannot play inside PlayGarba. Open the exact recording on YouTube or choose another recording.', { retry: false });
      return;
    }
    if (code === 100) {
      showRecovery('This recording is unavailable on YouTube. Choose another recording, or open its exact YouTube page for details.', { retry: false });
      return;
    }
    showRecovery('YouTube playback failed for this recording. Retry here, open the exact recording on YouTube, or choose another recording.');
  }

  function destroyPlayer() {
    playerGeneration += 1;
    stopPolling();
    const currentPlayer = player;
    const rejectReady = playerReadyReject;
    player = null;
    playerReadyPromise = null;
    playerReadyReject = null;
    playerState = -1;
    lastMediaSessionPositionKey = '';
    try { currentPlayer?.destroy?.(); } catch { /* already detached */ }
    try { rejectReady?.(new Error('YouTube player initialisation cancelled')); } catch { /* already settled */ }
  }

  async function ensurePlayer(initialVideoId, expectedToken) {
    if (playerReadyPromise) return playerReadyPromise;

    await loadApi();
    if (expectedToken !== openToken || !activeSong) throw new Error('YouTube player initialisation cancelled');
    if (playerReadyPromise) return playerReadyPromise;

    const media = $('youtubeProviderMedia');
    const generation = ++playerGeneration;
    const mount = document.createElement('div');
    mount.id = 'garba-youtube-player';
    media?.replaceChildren(mount);

    playerReadyPromise = new Promise((resolve, reject) => {
      let ready = false;
      let createdPlayer = null;
      let timeout = null;

      const rejectIfCurrent = (error) => {
        if (generation !== playerGeneration) return;
        clearTimeout(timeout);
        if (player === createdPlayer) player = null;
        playerReadyPromise = null;
        playerReadyReject = null;
        playerState = -1;
        try { createdPlayer?.destroy?.(); } catch { /* partially initialised */ }
        reject(error);
      };

      playerReadyReject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };

      try {
        createdPlayer = new window.YT.Player(mount.id, {
          width: '100%',
          height: '100%',
          videoId: initialVideoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: location.origin,
          },
          events: {
            onReady: () => {
              if (generation !== playerGeneration || player !== createdPlayer) return;
              ready = true;
              clearTimeout(timeout);
              playerReadyReject = null;
              resolve(createdPlayer);
            },
            onStateChange: (event) => handlePlayerStateChange(event, generation, createdPlayer),
            onAutoplayBlocked: (event) => handleAutoplayBlocked(event, generation, createdPlayer),
            onError: (event) => handlePlayerError(event, generation, createdPlayer),
          },
        });
        player = createdPlayer;
      } catch (error) {
        rejectIfCurrent(error);
        return;
      }

      timeout = setTimeout(() => {
        if (!ready) rejectIfCurrent(new Error('YouTube player readiness timed out'));
      }, 12000);
    });

    return playerReadyPromise;
  }

  function close() {
    openToken += 1;
    activeRequestGeneration = openToken;
    activeVideoId = '';
    destroyPlayer();
    activeSong = null;
    baseStart = 0;
    trackDuration = 0;
    lastPersistedSecond = -1;
    lastMediaSessionPositionKey = '';
    advanceLock = false;
    continueAfterNavigation = false;
    retryCount = 0;
    const stage = $('youtubeStage');
    stage?.classList.remove('open', 'is-loading', 'needs-tap');
    if (stage) delete stage.dataset.recovery;
    stage?.setAttribute('aria-hidden', 'true');
    $('youtubeProviderMedia')?.replaceChildren();
    const retryButton = $('youtubeDockRetry');
    const chooseButton = $('youtubeDockChoose');
    if (retryButton) retryButton.hidden = true;
    if (chooseButton) chooseButton.hidden = true;
    setPlaying(false);
    setProgressState(0, 0);
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.setPositionState();
    } catch {
      // Position state clearing is optional.
    }
  }

  function restoreElapsed(song) {
    try {
      if (song?.id?.startsWith('nonstop:')) {
        const setId = song.nonstopSetId || song.id.slice(8);
        const sourceIdentity = `youtube:${videoId(song)}`;
        const raw = localStorage.getItem('garba:nonstop-resume:v1');
        if (!raw) return 0;
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || !Array.isArray(parsed?.entries)) return 0;
        const record = parsed.entries.find((e) => e?.setId === setId);
        if (!record || record.sourceIdentity !== sourceIdentity) return 0;
        const saved = Number(record.positionSeconds || 0);
        if (!Number.isFinite(saved) || saved < 0) return 0;
        const max = Number(song.durationSeconds || record.durationSeconds || 0);
        return max > 0 ? Math.min(saved, Math.max(0, max - 1)) : saved;
      }
      const session = JSON.parse(localStorage.getItem('garba:session') || '{}');
      if (session.songId !== song?.id) return 0;
      const saved = Number(session.elapsed || 0);
      if (!Number.isFinite(saved) || saved < 0) return 0;
      const max = Number(song.durationSeconds || 0);
      return max > 0 ? Math.min(saved, Math.max(0, max - 1)) : saved;
    } catch {
      return 0;
    }
  }

  // The next track of the same recording, already playing at its first second: keep playing and only change what
  // the player shows, so a nonstop album cut into tracks runs without a gap between them.
  function continueSameRecording(song, id, { resume = true, retry = false } = {}) {
    if (retry || !player || !activeSong || activeSong.id === song.id || activeVideoId !== id) return false;
    if (String(song.id || '').startsWith('nonstop:') || String(activeSong.id || '').startsWith('nonstop:')) return false;
    if (playerState !== states().PLAYING && playerState !== states().BUFFERING) return false;
    if (startOverride?.songId === song.id) return false;
    const start = Math.max(0, Number(song.youtubeStartSeconds || 0));
    let now = 0;
    try {
      if (String(player.getVideoData?.()?.video_id || '').trim() !== id) return false;
      now = Number(player.getCurrentTime?.() || 0);
    } catch {
      return false;
    }
    if (!(now > start - 3 && now < start + 5)) return false;
    if (resume && restoreElapsed(song) > 3) return false;
    activeSong = song;
    baseStart = start;
    const next = laterSliceStart(song, id, start);
    trackDuration = trackLength(song, next, start);
    fadeInSeconds = 0;
    fadeOutTail = !(next && trackDuration === next - start);
    nextOpenIsAuto = false;
    lastPersistedSecond = -1;
    lastMediaSessionPositionKey = '';
    advanceLock = false;
    prepareStageForSong(song, id);
    setPlaying(true);
    setProgressState(Math.max(0, now - start), trackDuration);
    window.dispatchEvent(new CustomEvent('garba:playback-state-change', {
      detail: Object.freeze({ playing: true, loading: false, songId: song.id }),
    }));
    return true;
  }

  async function open(song, { autoplay = true, resume = true, retry = false } = {}) {
    if (!canControl(song)) return false;
    const id = videoId(song);
    if (autoplay && continueSameRecording(song, id, { resume, retry })) return true;
    const token = ++openToken;
    if (!retry) retryCount = 0;

    closeGenericProvider();
    stopPolling();
    activeSong = song;
    baseStart = Math.max(0, Number(song.youtubeStartSeconds || 0));
    const nextSliceStart = laterSliceStart(song, id, baseStart);
    trackDuration = trackLength(song, nextSliceStart, baseStart);
    fadeInSeconds = nextOpenIsAuto ? FADE_SECONDS : 4;
    fadeOutTail = !(nextSliceStart && trackDuration === nextSliceStart - baseStart);
    nextOpenIsAuto = false;
    lastVolume = -1;
    playerState = -1;
    lastPersistedSecond = -1;
    lastMediaSessionPositionKey = '';
    advanceLock = false;
    const logicalStart = resetPlaybackState(song, id, token, { resume });

    const stage = prepareStageForSong(song, id);
    if (!navigator.onLine) {
      stage.classList.remove('is-loading');
      showRecovery('You are offline. Reconnect, then retry this recording.', { retry: true });
      return false;
    }

    stage.classList.add('is-loading');
    setNote('YouTube · loading', { loading: true });
    window.dispatchEvent(new CustomEvent('garba:playback-state-change', {
      detail: Object.freeze({ playing: true, loading: true, songId: song.id }),
    }));

    try {
      const readyPlayer = await ensurePlayer(id, token);
      if (token !== openToken || activeRequestGeneration !== token || activeSong?.id !== song.id) return false;

      const startSeconds = baseStart + logicalStart;
      // When another track of this recording follows, the video keeps running past this one's end; the progress
      // check moves to the next track at the boundary and the video plays straight on into it
      const endSeconds = trackDuration > 0 && !nextSliceStart ? baseStart + trackDuration : undefined;
      const request = { videoId: id, startSeconds };
      if (Number.isFinite(endSeconds) && endSeconds > startSeconds) request.endSeconds = endSeconds;

      // Start quiet when the song fades in from its beginning
      try { readyPlayer.setVolume?.(logicalStart < fadeInSeconds ? 0 : 100); lastVolume = logicalStart < fadeInSeconds ? 0 : 100; } catch { /* level control is optional */ }
      if (autoplay) readyPlayer.loadVideoById(request);
      else readyPlayer.cueVideoById(request);
      // A sync correction may have left the previous recording slightly fast or slow.
      try { readyPlayer.setPlaybackRate?.(1); } catch { /* rate control is optional */ }

      stage.classList.remove('is-loading');
      return true;
    } catch (error) {
      if (token !== openToken || activeRequestGeneration !== token) return false;
      console.warn('GARBA YouTube engine failed to initialise', error);
      stage.classList.remove('is-loading');
      setPlaying(false);
      const reason = String(error?.message || '');
      const message = /timed out/i.test(reason)
        ? 'YouTube is taking too long to load. Retry here, open the exact recording on YouTube, or choose another recording.'
        : 'YouTube could not initialise for this recording. Retry here, open the exact recording on YouTube, or choose another recording.';
      showRecovery(message, { retry: true });
      return false;
    }
  }

  // Open a recording at an exact logical position (Garba Circle), bypassing the saved session.
  function openAt(song, logicalSeconds) {
    if (!canControl(song)) return Promise.resolve(false);
    const seconds = Number(logicalSeconds);
    startOverride = Number.isFinite(seconds) && seconds >= 0 ? { songId: song.id, seconds } : null;
    return open(song, { autoplay: true, resume: false });
  }

  function currentElapsedSeconds() {
    if (!player || !activeSong) return null;
    try {
      if (String(player.getVideoData?.()?.video_id || '').trim() !== activeVideoId) return null;
    } catch {
      return null;
    }
    return elapsed();
  }

  function toggle(song = currentSafeSong()) {
    if (!canControl(song)) return false;
    if (activeSong?.id !== song.id || !player) {
      window.dispatchEvent(new CustomEvent('garba:playback-state-change', {
        detail: Object.freeze({ playing: true, loading: true, songId: song.id }),
      }));
      open(song, { autoplay: true });
      return true;
    }
    try {
      if (playerState === states().PLAYING || playerState === states().BUFFERING) player.pauseVideo();
      else player.playVideo();
      setPlaying(playerState !== states().PLAYING && playerState !== states().BUFFERING);
      return true;
    } catch {
      return false;
    }
  }

  function seekTo(logicalSeconds) {
    if (!player || !activeSong) return false;
    const total = duration();
    const safe = Math.max(0, total > 0 ? Math.min(Number(logicalSeconds || 0), total) : Number(logicalSeconds || 0));
    try {
      player.seekTo(baseStart + safe, true);
      lastMediaSessionPositionKey = '';
      syncProgress();
      return true;
    } catch {
      return false;
    }
  }

  function advance() {
    if (!activeSong || advanceLock) return;
    advanceLock = true;
    nextOpenIsAuto = true;
    continueAfterNavigation = true;
    $('nextButton')?.click();
  }

  function genericPlay() {
    bypassNextPlay = true;
    queueMicrotask(() => playButton?.click());
  }

  function reopenAfterNavigation() {
    const nonstopOwnsVisibleIdentity = $('app')?.dataset.playMode === 'nonstop'
      && String(activeSong?.id || '').startsWith('nonstop:');
    if (nonstopOwnsVisibleIdentity) return;

    const next = currentSafeSong();
    if (activeSong && next && next.id === activeSong.id) return;
    if (activeSong && next && next.id !== activeSong.id && !continueAfterNavigation && playerState !== states().PLAYING) {
      close();
      return;
    }
    if (!continueAfterNavigation && playerState !== states().PLAYING) return;

    continueAfterNavigation = false;
    advanceLock = false;
    queueMicrotask(() => {
      const song = currentSafeSong();
      if (canControl(song)) {
        if (activeSong?.id !== song.id) {
          open(song, { autoplay: true, resume: false });
        }
        return;
      }
      close();
      genericPlay();
    });
  }

  function interceptResolvedPlay(event, song) {
    if (!canControl(song)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle(song);
    return true;
  }

  function captureClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (activeSong && target.closest('#prevButton, #nextButton, #miniPrev, #miniNext')) {
      continueAfterNavigation = true;
      advanceLock = false;
      return;
    }

    if (target.closest('.song-copy')) {
      continueAfterNavigation = true;
      advanceLock = false;
      return;
    }

    if (!target.closest('#playButton, #miniPlay')) return;
    if (bypassNextPlay) {
      bypassNextPlay = false;
      return;
    }
    if (audio?.getAttribute('src')) return;

    const safeSong = currentSafeSong();
    if (safeSong) {
      if (interceptResolvedPlay(event, safeSong)) return;
      if (activeSong) close();
      return;
    }

    const bootSong = currentBootSong();
    if (!youtubeCandidate(bootSong)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    loadSafeSongs().then(() => {
      const resolved = currentSafeSong();
      if (canControl(resolved)) toggle(resolved);
      else genericPlay();
    });
  }

  function captureKeys(event) {
    if (event.key === 'Escape' && activeSong) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }

    if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && activeSong) {
      continueAfterNavigation = true;
      advanceLock = false;
      return;
    }

    if (event.code !== 'Space') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, a[href], input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (audio?.getAttribute('src')) return;

    const song = currentSafeSong();
    if (!canControl(song)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle(song);
  }

  function captureSeek() {
    if (!activeSong || !player || !progress) return;
    const total = duration();
    if (total > 0) seekTo(Number(progress.value) / 1000 * total);
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.setActionHandler('play', () => activeSong ? player?.playVideo?.() : playButton?.click()); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler('pause', () => activeSong ? player?.pauseVideo?.() : audio?.pause()); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler('stop', () => activeSong ? close() : audio?.pause()); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler('previoustrack', () => $('prevButton')?.click()); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler('nexttrack', () => $('nextButton')?.click()); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (activeSong && Number.isFinite(details.seekTime)) seekTo(details.seekTime);
    }); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      if (activeSong) seekTo(elapsed() - (details.seekOffset || 10));
    }); } catch { /* unsupported */ }
    try { navigator.mediaSession.setActionHandler('seekforward', (details) => {
      if (activeSong) seekTo(elapsed() + (details.seekOffset || 10));
    }); } catch { /* unsupported */ }
  }

  document.addEventListener('pointerdown', prepareApiFromPlaybackIntent, { capture: true, passive: true });
  document.addEventListener('click', captureClick, { capture: true });
  document.addEventListener('keydown', captureKeys, { capture: true });
  progress?.addEventListener('input', captureSeek, { capture: true });

  if (songTitle) {
    new MutationObserver(reopenAfterNavigation)
      .observe(songTitle, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener('garba:catalogue-ready', () => loadSafeSongs({ refresh: true }));
  window.addEventListener('offline', () => {
    if (!activeSong) return;
    destroyPlayer();
    setPlaying(false);
    const id = activeVideoId || videoId(activeSong);
    const stage = prepareStageForSong(activeSong, id);
    stage.classList.remove('is-loading');
    showRecovery('You are offline. Reconnect, then retry this recording.', { retry: true });
  });
  window.addEventListener('load', () => {
    loadSafeSongs({ refresh: true });
    setTimeout(setupMediaSession, 0);
  }, { once: true });

  loadSafeSongs();

  window.GARBA_YOUTUBE_PLAYER = {
    canPlay: canControl,
    open,
    openAt,
    close,
    seekTo,
    toggle,
    retry: retryActive,
    chooseAnother,
    get activeSongId() { return activeSong?.id || null; },
    get requestGeneration() { return activeRequestGeneration; },
    get playing() { return playerState === states().PLAYING; },
    get ended() { return playerState === states().ENDED; },
    // Logical seconds into the active recording, or null while another video is still loading.
    get elapsedSeconds() { return currentElapsedSeconds(); },
    // Playback-rate control for sync corrections (Garba Circle, Live Radio). Empty when unsupported.
    getAvailablePlaybackRates() {
      try {
        const rates = player?.getAvailablePlaybackRates?.();
        return Array.isArray(rates) ? rates.map(Number).filter((rate) => Number.isFinite(rate) && rate > 0) : [];
      } catch {
        return [];
      }
    },
    setPlaybackRate(rate) {
      const value = Number(rate);
      if (!player || !Number.isFinite(value) || value <= 0) return false;
      try {
        player.setPlaybackRate?.(value);
        return true;
      } catch {
        return false;
      }
    },
  };
})();
