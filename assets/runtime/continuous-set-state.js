const GARBA_CONTINUOUS_SET_RUNTIME = true;

(() => {
  const continuousType = 'youtube-continuous-set';

  function containerKey(song) {
    if (!song || song.playbackContainerType !== continuousType) return '';
    const id = String(song.playbackContainerId || song.youtubeId || '').trim();
    return id ? `${continuousType}:${id}` : '';
  }

  function isContinuousSong(song = currentSong()) {
    if (els.app?.dataset.playMode === 'nonstop') return false;
    return Boolean(containerKey(song));
  }

  function displayDuration(song) {
    const chapter = Number(song?.chapterDurationSeconds);
    if (Number.isFinite(chapter) && chapter > 0) return chapter;
    const duration = Number(song?.durationSeconds);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  function distinctUpNext(limit = 12) {
    const list = songsForGenre(state.genreId);
    if (!list.length) return [];
    const currentIndex = list.findIndex((song) => song.id === state.songId);
    const start = currentIndex < 0 ? -1 : currentIndex;
    const activeKey = containerKey(currentSong());
    const seen = new Set(activeKey ? [activeKey] : []);
    const result = [];

    for (let offset = 1; offset <= list.length && result.length < limit; offset += 1) {
      const song = list[(start + offset + list.length) % list.length];
      if (!song || song.id === state.songId) continue;
      const key = containerKey(song) || `song:${song.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(song);
    }
    return result;
  }

  function adjacentDistinct(direction) {
    const list = songsForGenre(state.genreId);
    if (!list.length) return null;
    const currentIndex = list.findIndex((song) => song.id === state.songId);
    const start = currentIndex < 0 ? 0 : currentIndex;
    const activeKey = containerKey(currentSong());

    for (let offset = 1; offset <= list.length; offset += 1) {
      const index = (start + direction * offset + list.length * 2) % list.length;
      const song = list[index];
      if (!song || song.id === state.songId) continue;
      if (activeKey && containerKey(song) === activeKey) continue;
      return song;
    }
    return null;
  }

  let syncingBadge = false;
  let continuousSyncScheduled = false;

  function scheduleContinuousSync() {
    if (continuousSyncScheduled) return;
    continuousSyncScheduled = true;
    queueMicrotask(() => {
      continuousSyncScheduled = false;
      syncContinuousUi();
    });
  }

  function syncContinuousUi() {
    const song = currentSong();
    if (!isContinuousSong(song)) {
      els.app?.removeAttribute('data-continuous-set');
      if (els.queueButton) {
        els.queueButton.title = 'Up next';
        els.queueButton.setAttribute('aria-label', 'Show queue');
      }
      return;
    }

    els.app?.setAttribute('data-continuous-set', 'true');
    const genre = currentGenre();
    const setTitle = String(song.playbackContainerTitle || '').trim();
    if (els.genreEyebrow) {
      const eyebrowText = `${genre?.label || 'Garba'} · Continuous set`;
      if (els.genreEyebrow.textContent !== eyebrowText) {
        els.genreEyebrow.textContent = eyebrowText;
      }
    }

    const upcoming = distinctUpNext();
    if (els.queueBadge) {
      const count = upcoming.length;
      const nextText = count > 9 ? '9+' : String(count);
      const nextShow = count > 0 && !mobileQuery.matches;
      if (els.queueBadge.textContent !== nextText || els.queueBadge.classList.contains('show') !== nextShow) {
        syncingBadge = true;
        try {
          if (els.queueBadge.textContent !== nextText) els.queueBadge.textContent = nextText;
          els.queueBadge.classList.toggle('show', nextShow);
        } finally {
          queueMicrotask(() => { syncingBadge = false; });
        }
      }
    }
    if (els.queueButton) {
      els.queueButton.title = 'After this set';
      const buttonAria = upcoming.length
        ? `Show what plays after this continuous set, ${upcoming.length} different recordings`
        : 'Show what plays after this continuous set';
      if (els.queueButton.getAttribute('aria-label') !== buttonAria) {
        els.queueButton.setAttribute('aria-label', buttonAria);
      }
    }
    if (els.trackBlock && setTitle && els.trackBlock.getAttribute('data-continuous-set-title') !== setTitle) {
      els.trackBlock.setAttribute('data-continuous-set-title', setTitle);
    }
  }

  async function selectAdjacentDistinct(direction) {
    const next = adjacentDistinct(direction);
    if (!next) return;
    await selectSong(next.id, { keepSheet: true, preservePlayback: true });
    syncContinuousUi();
  }

  function renderDistinctQueue() {
    if (state.sheetMode !== 'queue' || !isContinuousSong()) return;
    const songs = distinctUpNext();
    state.sheetMatchCount = songs.length;
    els.sheetTitle.textContent = 'After this set';
    if (els.sheetSummary) {
      els.sheetSummary.textContent = `${songs.length.toLocaleString()} different ${songs.length === 1 ? 'recording' : 'recordings'}`;
    }
    els.songList.replaceChildren();

    const current = currentSong();
    const setTitle = String(current?.playbackContainerTitle || '').trim();
    const note = document.createElement('div');
    note.className = 'search-result-hint';
    note.setAttribute('role', 'status');
    note.textContent = setTitle
      ? `${setTitle} keeps playing as one continuous YouTube recording. These are the recordings after it.`
      : 'This set keeps playing as one continuous YouTube recording. These are the recordings after it.';
    els.songList.append(note);

    if (!songs.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const strong = document.createElement('strong');
      const copy = document.createElement('span');
      strong.textContent = 'Nothing after this set';
      copy.textContent = 'Choose another genre or recording when you want to switch.';
      empty.append(strong, copy);
      els.songList.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    songs.forEach((song, index) => {
      const row = document.createElement('div');
      row.className = 'song-row';
      row.role = 'listitem';

      const idx = document.createElement('span');
      idx.className = 'song-index';
      idx.textContent = String(index + 1).padStart(2, '0');

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'song-copy';
      copy.setAttribute('aria-label', `Play ${song.title} by ${song.artist}`);
      const title = document.createElement('strong');
      title.textContent = song.title;
      const artist = document.createElement('small');
      artist.textContent = song.artist;
      copy.append(title, artist);
      copy.addEventListener('click', () => selectSong(song.id, { keepSheet: true }));

      const duration = document.createElement('span');
      duration.className = 'song-duration';
      duration.textContent = formatDuration(displayDuration(song));

      const favourite = document.createElement('button');
      favourite.type = 'button';
      favourite.className = `heart-button song-favourite${state.favourites.has(song.id) ? ' active' : ''}`;
      favourite.setAttribute('aria-label', state.favourites.has(song.id) ? `Remove ${song.title} from favourites` : `Add ${song.title} to favourites`);
      favourite.setAttribute('aria-pressed', String(state.favourites.has(song.id)));
      favourite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.3 1-1a5.5 5.5 0 0 0 0-7.8Z"></path></svg>';
      favourite.addEventListener('click', () => {
        toggleFavourite(song.id);
        if (state.sheetMode === 'queue' && isContinuousSong()) renderDistinctQueue();
      });

      row.append(idx, copy, duration, favourite);
      fragment.append(row);
    });
    els.songList.append(fragment);
  }

  function captureContinuousTransport(event) {
    if (!isContinuousSong()) return;
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('#prevButton, #nextButton, #miniPrev, #miniNext');
    if (!button) return;
    const direction = button.matches('#prevButton, #miniPrev') ? -1 : 1;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectAdjacentDistinct(direction);
  }

  function captureContinuousQueue(event) {
    if (!isContinuousSong()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#queueButton')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openSheet('queue', { trigger: els.queueButton });
    renderDistinctQueue();
  }

  function captureContinuousKeys(event) {
    if (!isContinuousSong() || event.target instanceof HTMLInputElement) return;
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectAdjacentDistinct(event.code === 'ArrowLeft' ? -1 : 1);
  }

  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (isContinuousSong()) selectAdjacentDistinct(-1);
        else changeSong(-1);
      });
    } catch { }
    try {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (isContinuousSong()) selectAdjacentDistinct(1);
        else changeSong(1);
      });
    } catch { }
  }

  document.addEventListener('click', captureContinuousTransport, { capture: true });
  document.addEventListener('click', captureContinuousQueue, { capture: true });
  document.addEventListener('keydown', captureContinuousKeys, { capture: true });

  if (els.songTitle) {
    new MutationObserver(scheduleContinuousSync)
      .observe(els.songTitle, { childList: true, characterData: true, subtree: true });
  }
  if (els.queueBadge) {
    new MutationObserver(() => {
      if (syncingBadge) return;
      if (!isContinuousSong()) return;
      const upcoming = distinctUpNext();
      const expectedText = upcoming.length > 9 ? '9+' : String(upcoming.length);
      if (els.queueBadge.textContent !== expectedText) {
        scheduleContinuousSync();
      }
    }).observe(els.queueBadge, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener('garba:catalogue-ready', scheduleContinuousSync);
  window.addEventListener('load', () => setTimeout(bindMediaSession, 40), { once: true });
  setTimeout(() => {
    syncContinuousUi();
    bindMediaSession();
  }, 0);
})();
