/**
 * PlayGarba playable-first ordering
 * Songs that can play right now come first. Among them, a song that is its own complete video
 * comes before a chapter cut from a longer jukebox or Nonstop video. Songs without a verified
 * playable route stay listed, after the playable ones.
 *
 * Nothing here changes which recording a song plays: a chapter is never swapped for a
 * different upload that happens to share its title.
 */

export const PLAYABLE_TIER = Object.freeze({ FULL: 0, CHAPTER: 1, UNAVAILABLE: 2 });

const CHAPTER_SOURCE_TYPES = new Set(['verified-performance-chapter', 'label-continuous-performance']);

/**
 * @param {Array} songs All catalogue songs
 * @param {{ canExecute: (song: object) => boolean, videoIdOf: (song: object) => string }} routes
 */
export function createPlayableOrder(songs = [], { canExecute, videoIdOf }) {
  const useCount = new Map();
  for (const song of songs || []) {
    if (!canExecute(song)) continue;
    const id = videoIdOf(song);
    if (id) useCount.set(id, (useCount.get(id) || 0) + 1);
  }

  const tierCache = new WeakMap();
  function tier(song) {
    if (!song || typeof song !== 'object') return PLAYABLE_TIER.UNAVAILABLE;
    if (tierCache.has(song)) return tierCache.get(song);
    let value = PLAYABLE_TIER.FULL;
    if (!canExecute(song)) value = PLAYABLE_TIER.UNAVAILABLE;
    else if (
      Number(song.youtubeStartSeconds || 0) > 0
      || Number(song.youtubeEndSeconds || 0) > 0
      || CHAPTER_SOURCE_TYPES.has(String(song.playbackSourceType || ''))
      || (useCount.get(videoIdOf(song)) || 0) > 1
    ) value = PLAYABLE_TIER.CHAPTER;
    tierCache.set(song, value);
    return value;
  }

  /** Stable sort: keeps the incoming order (catalogue order or search rank) inside each tier. */
  function order(list = []) {
    return list
      .map((song, index) => ({ song, index, tier: tier(song) }))
      .sort((a, b) => a.tier - b.tier || a.index - b.index)
      .map((entry) => entry.song);
  }

  /**
   * Pick a song to start right away: a complete song not heard recently when possible,
   * then any complete song, then chapters. Returns null when nothing in the list can play.
   */
  function pickFresh(list = [], { recentIds = [], random = Math.random, avoidId = null } = {}) {
    const recent = new Set(recentIds);
    const pools = [PLAYABLE_TIER.FULL, PLAYABLE_TIER.CHAPTER].map((wanted) => list.filter((song) => tier(song) === wanted && song.id !== avoidId));
    for (const pool of pools) {
      const fresh = pool.filter((song) => !recent.has(song.id));
      const candidates = fresh.length ? fresh : pool;
      if (candidates.length) return candidates[Math.floor(random() * candidates.length)];
    }
    return null;
  }

  return Object.freeze({ tier, order, pickFresh });
}
