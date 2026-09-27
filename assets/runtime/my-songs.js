/**
 * PlayGarba "Add a song"
 * Listeners can paste a YouTube link, check the name PlayGarba reads from it, pick a category
 * and play it. Added songs stay on this device only (localStorage). They are never mixed into
 * 24/7 Live Radio or Garba Circle, which must be identical on every device. A listener can
 * also suggest the song for the shared catalogue, which opens a prefilled GitHub issue for
 * review; nothing is added to the catalogue automatically.
 */

export const MY_SONGS_KEY = 'garba:my-songs:v1';
export const MY_SONGS_LIMIT = 200;
export const USER_SOURCE_TYPE = 'user-added';
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const MAX_TEXT = 140;
const ISSUE_URL = 'https://github.com/ruddvz/garba/issues/new';

/** Read the video id from a pasted YouTube link (or a bare 11-character id). */
export function parseYouTubeLink(value) {
  const text = String(value || '').trim();
  if (VIDEO_ID_RE.test(text)) return text;
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (url.hostname.toLowerCase().endsWith('youtu.be')) id = parts[0];
  else if (url.searchParams.get('v')) id = url.searchParams.get('v');
  else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
  id = String(id || '').trim();
  return VIDEO_ID_RE.test(id) ? id : null;
}

const LIST_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;

/**
 * Read a playlist id from a pasted YouTube link (`list=`). YouTube Mixes (RD…) are YouTube's endless radio, and
 * Liked videos / Watch later (LL, WL) are private, so those links play just their video.
 */
export function parseYouTubePlaylist(value) {
  const text = String(value || '').trim();
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const list = String(url.searchParams.get('list') || '').trim();
  if (!LIST_ID_RE.test(list) || /^(RD|UL|LL|WL)/.test(list)) return null;
  return list;
}

function whenYouTubeApi(win, doc, timeoutMs) {
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (!doc.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const script = doc.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    doc.head.appendChild(script);
  }
  // The player runtime may own onYouTubeIframeAPIReady, so wait for the API itself rather than the callback
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (win.YT?.Player) { clearInterval(poll); resolve(win.YT); }
      else if (Date.now() - started > timeoutMs) { clearInterval(poll); reject(new Error('YouTube API unavailable')); }
    }, 150);
  });
}

/**
 * The videos in a YouTube playlist, in order, read by a small YouTube player that is never shown and never plays.
 * Resolves to an empty list when the playlist is private, empty or can't be reached.
 */
export function resolveYouTubePlaylist(listId, { timeoutMs = 12000, win = globalThis.window, doc = globalThis.document } = {}) {
  return new Promise((resolve) => {
    if (!LIST_ID_RE.test(String(listId || '')) || !win || !doc?.body) { resolve([]); return; }
    let done = false;
    let player = null;
    let poll = 0;
    const host = doc.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:200px;height:200px;opacity:0;pointer-events:none;';
    const mount = doc.createElement('div');
    host.appendChild(mount);
    doc.body.appendChild(host);
    const finish = (ids) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      try { player?.destroy?.(); } catch { /* already gone */ }
      host.remove();
      const seen = new Set();
      resolve(ids.filter((id) => VIDEO_ID_RE.test(String(id)) && !seen.has(id) && seen.add(id)).slice(0, MY_SONGS_LIMIT));
    };
    const timer = setTimeout(() => finish([]), timeoutMs);
    const read = () => {
      try {
        const ids = player?.getPlaylist?.();
        if (Array.isArray(ids) && ids.length) finish(ids);
      } catch { /* not ready yet */ }
    };
    whenYouTubeApi(win, doc, Math.max(1000, timeoutMs - 1000)).then((YT) => {
      if (done) return;
      player = new YT.Player(mount, {
        width: 200,
        height: 200,
        playerVars: { listType: 'playlist', list: listId, autoplay: 0, controls: 0, playsinline: 1, origin: win.location?.origin },
        events: {
          onReady: () => {
            read();
            if (done) return;
            try { player.cuePlaylist({ listType: 'playlist', list: listId }); } catch { /* the playerVars list is enough */ }
            poll = setInterval(read, 250);
          },
          onStateChange: read,
          onError: read,
        },
      });
    }, () => finish([]));
  });
}

const NOISE_WORDS = /\b(official|video|audio|lyric(?:s|al)?|full\s*(?:song|video|hd)?|song|hd|4k|1080p|720p|hq|new|latest|trending|superhit|super\s*hit|exclusive|gujarati|garba\s*song|navratri(?:\s*special)?(?:\s*\d{4})?|\d{4})\b/gi;

function isNoise(segment) {
  const rest = segment.replace(NOISE_WORDS, '').replace(/[^\p{L}\p{N}]+/gu, '');
  return rest.length === 0;
}

function tidy(value) {
  return String(value || '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|:,.]+|[\s\-–—|:,.]+$/g, '')
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * Turn a raw YouTube title and channel into a clean song title and artist.
 * "Rang Taali | Aishwarya Majmudar | Official Video | Navratri 2023" → title "Rang Taali",
 * artist "Aishwarya Majmudar". The listener can still edit both before saving.
 */
export function cleanVideoTitle(rawTitle, channel = '') {
  let text = String(rawTitle || '');
  // Drop bracketed notes that only describe the upload: (Official Video), [Full HD], (Lyrical).
  text = text.replace(/[([{【]([^)\]}】]*)[)\]}】]/g, (match, inner) => (isNoise(inner) ? ' ' : match));
  const segments = text.split(/\s*(?:\||║|｜|\s[-–—]\s|:\s)\s*/).map(tidy).filter((part) => part && !isNoise(part));
  const title = segments[0] || tidy(rawTitle) || 'Untitled';
  const channelArtist = tidy(String(channel || '').replace(/\s*-\s*topic$/i, '').replace(/\b(official|music|studio|records|channel)\b/gi, ''));
  const artist = segments[1] || channelArtist || '';
  return { title, artist };
}

/** A song record shaped like catalogue songs, marked as added by this listener. */
export function makeUserSong({ videoId, title, artist, genre, addedAt = Date.now() }) {
  if (!VIDEO_ID_RE.test(String(videoId || ''))) return null;
  return {
    id: `mine-${videoId}`,
    title: tidy(title) || 'Untitled',
    artist: tidy(artist) || 'Added by you',
    genre: String(genre || 'traditional'),
    category: 'user-added',
    styles: [],
    durationSeconds: 0,
    releaseId: null,
    trackNumber: null,
    audioUrl: null,
    youtubeId: videoId,
    playbackProvider: 'youtube',
    playbackSourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    playbackSourceType: USER_SOURCE_TYPE,
    userAdded: true,
    addedAt,
  };
}

/** Parse stored songs defensively: anything malformed is dropped. */
export function readMySongs(raw, genreIds = null) {
  let list;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const songs = [];
  for (const entry of list.slice(0, MY_SONGS_LIMIT)) {
    const genre = genreIds && !genreIds.has(entry?.genre) ? 'traditional' : entry?.genre;
    const song = makeUserSong({ videoId: entry?.videoId, title: entry?.title, artist: entry?.artist, genre, addedAt: Number(entry?.addedAt) || 0 });
    if (song && !seen.has(song.id)) {
      seen.add(song.id);
      songs.push(song);
    }
  }
  return songs;
}

export function serializeMySongs(songs) {
  return JSON.stringify(songs.slice(0, MY_SONGS_LIMIT).map((song) => ({
    videoId: song.youtubeId, title: song.title, artist: song.artist, genre: song.genre, addedAt: song.addedAt,
  })));
}

/** YouTube's public oEmbed endpoint: title and channel name, no key and no cookies. */
export async function fetchVideoDetails(videoId, { fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 6000 } = {}) {
  if (!VIDEO_ID_RE.test(String(videoId || '')) || !fetchImpl) return null;
  const target = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetchImpl(target, { credentials: 'omit', signal: controller?.signal });
    if (!response.ok) return { unavailable: response.status === 401 || response.status === 403 || response.status === 404 };
    const data = await response.json();
    return { title: String(data?.title || ''), channel: String(data?.author_name || '') };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Prefilled "Missing music" issue so the catalogue team can verify and add the song. */
export function suggestionUrl(song, genreLabel = '') {
  const url = new URL(ISSUE_URL);
  url.searchParams.set('template', 'missing-song.yml');
  url.searchParams.set('title', `[Missing music] ${song.title}${song.artist && song.artist !== 'Added by you' ? ` — ${song.artist}` : ''}`);
  if (song.artist && song.artist !== 'Added by you') url.searchParams.set('artist', song.artist);
  url.searchParams.set('source', song.playbackSourceUrl);
  if (genreLabel) url.searchParams.set('style', genreLabel);
  url.searchParams.set('notes', 'Suggested from the PlayGarba player (Add a song).');
  return url.toString();
}

/* ------------------------------------------------------------------------------------------ */

const COPY = {
  title: 'Add a song',
  lede: 'Paste a YouTube link. PlayGarba reads the name, you check it and choose a category. It plays here right away and stays on this device.',
  invalid: 'That doesn’t look like a YouTube video link.',
  reading: 'Reading the video…',
  readFailed: 'Couldn’t read the name from YouTube. Type it in below.',
  unavailable: 'YouTube says this video isn’t available to play outside YouTube. It may not play here.',
  exists: 'This song is already in PlayGarba.',
  saved: 'Added. Playing now.',
};

/**
 * @param {{
 *   genres: () => Array<{ id: string, label: string }>,
 *   findByVideoId: (videoId: string) => object | null,
 *   onChange: (songs: Array) => void,
 *   play: (song: object) => void,
 *   showToast: (message: string) => void,
 *   storage?: Storage,
 * }} app
 */
export function createMySongs(app) {
  const store = app.storage || (() => { try { return window.localStorage; } catch { return null; } })();
  let songs = [];
  let dialog = null;
  const parts = {};
  let lookupToken = 0;
  let current = null; // { videoId, details }

  function load(genreIds) {
    try { songs = readMySongs(store?.getItem(MY_SONGS_KEY) || '[]', genreIds); } catch { songs = []; }
    return songs;
  }

  function persist() {
    try { store?.setItem(MY_SONGS_KEY, serializeMySongs(songs)); } catch { /* storage full or blocked */ }
    app.onChange(songs);
  }

  function remove(songId) {
    songs = songs.filter((song) => song.id !== songId);
    persist();
    renderList();
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'my-song-dialog';
    dialog.setAttribute('aria-labelledby', 'mySongTitle');
    dialog.innerHTML = `
      <form class="my-song-sheet" method="dialog" novalidate>
        <header class="my-song-header">
          <h2 id="mySongTitle"></h2>
          <button class="icon-button my-song-close" type="button" data-part="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>
        </header>
        <p class="my-song-lede" data-part="lede"></p>
        <label class="my-song-field"><span>YouTube link</span>
          <input data-part="link" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://www.youtube.com/watch?v=…" required>
        </label>
        <p class="my-song-note" data-part="note" role="status" aria-live="polite"></p>
        <div class="my-song-details" data-part="details" hidden>
          <label class="my-song-field"><span>Song name</span><input data-part="songTitle" type="text" maxlength="${MAX_TEXT}" autocomplete="off" required></label>
          <label class="my-song-field"><span>Artist</span><input data-part="artist" type="text" maxlength="${MAX_TEXT}" autocomplete="off"></label>
          <label class="my-song-field"><span>Category</span><select data-part="genre"></select></label>
          <button class="my-song-primary" type="submit" data-part="save">Add and play</button>
        </div>
        <section class="my-song-list" data-part="listWrap" hidden>
          <h3>Added by you</h3>
          <ul data-part="list"></ul>
        </section>
      </form>`;
    document.body.append(dialog);
    for (const node of dialog.querySelectorAll('[data-part]')) parts[node.dataset.part] = node;
    dialog.querySelector('#mySongTitle').textContent = COPY.title;
    parts.lede.textContent = COPY.lede;
    parts.close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    parts.link.addEventListener('input', () => lookup(parts.link.value));
    parts.link.addEventListener('paste', () => setTimeout(() => lookup(parts.link.value), 0));
    // Keys typed here belong to the form, not to the player's global shortcuts.
    window.addEventListener('keydown', (event) => {
      if (dialog?.open) event.stopPropagation();
    }, { capture: true });
    dialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });
  }

  function setNote(text) {
    parts.note.textContent = text || '';
  }

  function fillGenres(selected) {
    const genres = app.genres();
    parts.genre.replaceChildren(...genres.map((genre) => {
      const option = document.createElement('option');
      option.value = genre.id;
      option.textContent = genre.label;
      return option;
    }));
    if (selected && genres.some((genre) => genre.id === selected)) parts.genre.value = selected;
  }

  async function lookup(value) {
    const token = ++lookupToken;
    const videoId = parseYouTubeLink(value);
    if (!videoId) {
      current = null;
      parts.details.hidden = true;
      setNote(String(value || '').trim() ? COPY.invalid : '');
      return;
    }
    if (current?.videoId === videoId) return;
    current = { videoId };
    const existing = app.findByVideoId(videoId);
    parts.details.hidden = false;
    parts.songTitle.value = existing?.title || '';
    parts.artist.value = existing?.artist && existing.artist !== 'Added by you' ? existing.artist : '';
    if (existing && !existing.userAdded) {
      setNote(COPY.exists);
      parts.save.textContent = 'Play it';
      return;
    }
    parts.save.textContent = 'Add and play';
    setNote(COPY.reading);
    const details = await fetchVideoDetails(videoId);
    if (token !== lookupToken) return;
    if (details?.title) {
      const clean = cleanVideoTitle(details.title, details.channel);
      if (!parts.songTitle.value) parts.songTitle.value = clean.title;
      if (!parts.artist.value) parts.artist.value = clean.artist;
      setNote(`From YouTube: “${details.title}”${details.channel ? ` · ${details.channel}` : ''}`);
    } else {
      setNote(details?.unavailable ? COPY.unavailable : COPY.readFailed);
    }
  }

  function save() {
    if (!current?.videoId) {
      setNote(COPY.invalid);
      parts.link.focus();
      return;
    }
    const existing = app.findByVideoId(current.videoId);
    if (existing && !existing.userAdded) {
      dialog.close();
      app.play(existing);
      return;
    }
    const title = parts.songTitle.value.trim();
    if (!title) {
      parts.songTitle.focus();
      return;
    }
    const song = makeUserSong({ videoId: current.videoId, title, artist: parts.artist.value, genre: parts.genre.value });
    songs = [song, ...songs.filter((entry) => entry.id !== song.id)].slice(0, MY_SONGS_LIMIT);
    persist();
    dialog.close();
    app.showToast(COPY.saved);
    app.play(song);
  }

  function renderList() {
    if (!dialog) return;
    parts.listWrap.hidden = songs.length === 0;
    const genreLabel = new Map(app.genres().map((genre) => [genre.id, genre.label]));
    parts.list.replaceChildren(...songs.map((song) => {
      const item = document.createElement('li');
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'my-song-item';
      const strong = document.createElement('strong');
      strong.textContent = song.title;
      const small = document.createElement('small');
      small.textContent = [song.artist, genreLabel.get(song.genre)].filter(Boolean).join(' · ');
      copy.append(strong, small);
      copy.addEventListener('click', () => { dialog.close(); app.play(song); });
      const suggest = document.createElement('a');
      suggest.className = 'my-song-link';
      suggest.href = suggestionUrl(song, genreLabel.get(song.genre));
      suggest.target = '_blank';
      suggest.rel = 'noopener noreferrer';
      suggest.textContent = 'Suggest for PlayGarba';
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'my-song-link';
      removeButton.textContent = 'Remove';
      removeButton.setAttribute('aria-label', `Remove ${song.title}`);
      removeButton.addEventListener('click', () => remove(song.id));
      item.append(copy, suggest, removeButton);
      return item;
    }));
  }

  function open({ genre } = {}) {
    if (!dialog) build();
    lookupToken += 1;
    current = null;
    parts.link.value = '';
    parts.songTitle.value = '';
    parts.artist.value = '';
    parts.details.hidden = true;
    setNote('');
    fillGenres(genre);
    renderList();
    if (!dialog.open) dialog.showModal();
    parts.link.focus();
  }

  return Object.freeze({
    load,
    open,
    get songs() { return songs; },
  });
}
