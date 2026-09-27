(() => {
  const upstreamFetch = window.fetch.bind(window);
  const MANIFEST_PATH = 'data/direct-audio.json';
  let manifestPromise = null;

  function requestPath(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return '';
      return new URL(raw, location.href).pathname;
    } catch {
      return '';
    }
  }

  const isSongsRequest = (input) => requestPath(input).endsWith('/data/songs.json');

  function validDirectEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const rights = entry.rights || {};
    const audioUrl = String(entry.audioUrl || '').trim();
    const proofUrl = String(rights.proofUrl || '').trim();
    return Boolean(
      audioUrl &&
      rights.redistributionAuthorized === true &&
      String(rights.rightsHolder || '').trim() &&
      String(rights.licenseName || '').trim() &&
      proofUrl
    );
  }

  async function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = upstreamFetch(MANIFEST_PATH, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return { tracks: {} };
        const manifest = await response.json();
        return manifest && typeof manifest === 'object' ? manifest : { tracks: {} };
      })
      .catch(() => ({ tracks: {} }));
    return manifestPromise;
  }

  function enrichSongs(songs, manifest) {
    if (!Array.isArray(songs)) return songs;
    const tracks = manifest?.tracks || {};
    return songs.map((song) => {
      const direct = tracks[song.id];
      if (!validDirectEntry(direct)) return song;
      return {
        ...song,
        audioUrl: direct.audioUrl,
        audioMimeType: direct.mimeType || null,
        playbackProvider: 'direct',
        playbackSourceUrl: direct.audioUrl,
        playbackSourceType: 'licensed-direct',
        playbackReady: true,
        directAudioRights: direct.rights,
      };
    });
  }

  window.fetch = async (input, init) => {
    const response = await upstreamFetch(input, init);
    if (!isSongsRequest(input) || !response.ok) return response;

    try {
      const [songs, manifest] = await Promise.all([
        response.clone().json(),
        loadManifest(),
      ]);
      const enriched = enrichSongs(songs, manifest);
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'no-store');
      return new Response(JSON.stringify(enriched), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };

  window.GARBA_DIRECT_AUDIO = Object.freeze({
    manifestPath: MANIFEST_PATH,
    loadManifest,
  });
})();
