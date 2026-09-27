/**
 * PlayGarba Synchronized 24/7 Live Broadcast Engine
 * Deterministic, epoch-synced global radio schedule.
 * All listeners worldwide hear the exact same song at the exact same second.
 */

const DEFAULT_SONG_DURATION = 180;

/**
 * True when a song has a verified, playable YouTube route that the live schedule can use.
 * Shared with Garba Circle so both modes agree on what is playable.
 */
export function isLivePlayable(s) {
  if (!s || !s.id) return false;
  // Songs a listener added live on one device only; a shared broadcast must not include them.
  if (s.userAdded || s.playbackSourceType === 'user-added') return false;
  if (s.audioUrl) return false;
  if (s.playbackSearchOnly) return false;
  if (s.playbackSourceType === 'verified-release-track-reference' || s.playbackSourceType === 'verified-unchaptered-youtube-release') return false;

  // Must have a verified, playable YouTube route with valid video ID
  const explicit = String(s.youtubeId || '').trim();
  if (explicit) return true;

  const provider = String(s.playbackProvider || '').toLowerCase();
  const sourceUrl = String(s.playbackSourceUrl || '');
  const isYouTube = provider === 'youtube' || /youtu(?:\.be|be\.com)/i.test(sourceUrl);
  if (!isYouTube) return false;

  try {
    const url = new URL(sourceUrl);
    if (url.hostname.toLowerCase().endsWith('youtu.be')) return Boolean(url.pathname.split('/').filter(Boolean)[0]);
    if (url.searchParams.get('v')) return Boolean(url.searchParams.get('v').trim());
    const parts = url.pathname.split('/').filter(Boolean);
    const marker = parts.findIndex((p) => p === 'embed' || p === 'shorts');
    return marker >= 0 && Boolean(parts[marker + 1]?.trim());
  } catch {
    return false;
  }
}

/**
 * Filter and deterministically sequence playable songs into a balanced 24/7 radio rotation
 */
export function buildLiveSchedule(songs = []) {
  const playable = (songs || []).filter(isLivePlayable);

  if (!playable.length) return [];

  // Group by genre to interleave them harmoniously (Traditional -> Dandiya -> Folk -> Devotional -> Fusion -> Sanedo)
  const genreBuckets = {
    traditional: [],
    dandiya: [],
    folk: [],
    devotional: [],
    fusion: [],
    sanedo: [],
  };

  for (const song of playable) {
    const genre = song.genre && genreBuckets[song.genre] ? song.genre : 'traditional';
    genreBuckets[genre].push(song);
  }

  // Interleave genres so live radio has varied, dynamic tempo and mood
  const schedule = [];
  const genreKeys = ['traditional', 'dandiya', 'folk', 'devotional', 'fusion', 'sanedo'];
  let maxLen = 0;
  for (const key of genreKeys) {
    if (genreBuckets[key].length > maxLen) maxLen = genreBuckets[key].length;
  }

  for (let i = 0; i < maxLen; i++) {
    for (const key of genreKeys) {
      if (i < genreBuckets[key].length) {
        schedule.push(genreBuckets[key][i]);
      }
    }
  }

  return schedule.length ? schedule : playable;
}

/**
 * Build the looping broadcast timeline once, so callers that read the position often (Live Radio
 * drift correction) do not rebuild the schedule on every read.
 * @param {Array} songs Catalogue songs
 * @returns {null | { totalDuration: number, segments: Array, at: (timestampMs: number) => object }}
 */
export function createLiveTimeline(songs = []) {
  const schedule = buildLiveSchedule(songs);
  if (!schedule.length) return null;

  // Build cumulative duration timeline
  let totalDuration = 0;
  const segments = [];

  for (let i = 0; i < schedule.length; i++) {
    const song = schedule[i];
    const duration = (Number.isFinite(song.durationSeconds) && song.durationSeconds > 10)
      ? Math.round(song.durationSeconds)
      : DEFAULT_SONG_DURATION;

    segments.push({
      song,
      songId: song.id,
      index: i,
      startSecond: totalDuration,
      duration,
      endSecond: totalDuration + duration,
    });
    totalDuration += duration;
  }

  if (totalDuration <= 0) return null;

  const at = (timestampMs) => {
    // Universal broadcast position (modulo timeline loop), kept to the millisecond so devices
    // with aligned clocks land on the same moment rather than the same whole second.
    const timelineSeconds = (Math.max(0, Number(timestampMs) || 0) / 1000) % totalDuration;

    // Binary search for the current segment
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (segments[mid].startSecond <= timelineSeconds) low = mid;
      else high = mid - 1;
    }
    const currentSegment = segments[low];

    const offsetSeconds = Math.max(0, timelineSeconds - currentSegment.startSecond);
    const nextIndex = (currentSegment.index + 1) % segments.length;
    const nextSong = segments[nextIndex].song;

    return {
      song: currentSegment.song,
      songId: currentSegment.songId,
      // Whole seconds, as before; offsetSeconds keeps the fraction.
      seekSeconds: Math.floor(offsetSeconds),
      offsetSeconds,
      duration: currentSegment.duration,
      remainingSeconds: Math.max(0, currentSegment.duration - Math.floor(offsetSeconds)),
      remainingExactSeconds: Math.max(0, currentSegment.duration - offsetSeconds),
      totalScheduleDuration: totalDuration,
      trackIndex: currentSegment.index,
      totalTracks: segments.length,
      nextSongId: nextSong.id,
      nextSong,
    };
  };

  return { totalDuration, segments, at };
}

/**
 * Compute the active broadcast track and seek position at a given millisecond timestamp
 * @param {Array} songs Catalogue songs
 * @param {number} timestampMs Date.now()
 */
export function getLiveBroadcastState(songs = [], timestampMs = Date.now()) {
  return createLiveTimeline(songs)?.at(timestampMs) || null;
}

/**
 * Get next scheduled live track for continuous station progression
 */
export function getNextLiveTrack(songs = [], currentSongId) {
  const schedule = buildLiveSchedule(songs);
  if (!schedule.length) return null;
  const currentIndex = schedule.findIndex((s) => s.id === currentSongId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % schedule.length : 0;
  return schedule[nextIndex];
}

if (typeof window !== 'undefined') {
  window.GARBA_LIVE_STATION = {
    isLivePlayable,
    buildLiveSchedule,
    createLiveTimeline,
    getLiveBroadcastState,
    getNextLiveTrack,
  };
}
