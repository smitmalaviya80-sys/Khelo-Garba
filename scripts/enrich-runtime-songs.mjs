import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

const index = await readJson('data/catalogue/index.json');
const songsPath = index.generatedFiles?.songs || 'data/songs.json';
const releasesPath = index.generatedFiles?.releases || 'data/releases.json';
const [songs, releases] = await Promise.all([readJson(songsPath), readJson(releasesPath)]);
const releasesById = new Map(releases.map((release) => [release.id, release]));
const sourcePaths = Array.isArray(index.playbackSources) ? index.playbackSources.filter(Boolean) : [];
if (!sourcePaths.length) throw new Error('No playback source manifests are declared in data/catalogue/index.json');

const manifests = await Promise.all(sourcePaths.map((file) => readJson(file)));
const routes = Object.assign({}, ...manifests.map((manifest) => manifest?.songSources || {}));
let enriched = 0;
let direct = 0;
let exactTrackFallbacks = 0;
let singleReleaseFallbacks = 0;
let releaseTrackReferenceFallbacks = 0;
let duplicateExactDowngrades = 0;
let unchapteredYoutubeReleaseFallbacks = 0;
let continuousYoutubeChapters = 0;
const missing = [];

function isExactTrackUrl(provider, sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const pathname = url.pathname.toLowerCase();
    if (provider === 'spotify') return /\/(?:intl-[^/]+\/)?track\/[^/]+/.test(pathname);
    if (provider === 'apple-music') return pathname.includes('/song/') || url.searchParams.has('i');
    if (provider === 'amazon-music') return /\/tracks\/[^/]+/.test(pathname) || (pathname.includes('/albums/') && Boolean(url.searchParams.get('trackAsin')));
  } catch {
    return false;
  }
  return false;
}

function isReleaseSpecificUrl(provider, sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const pathname = url.pathname.toLowerCase();
    if (provider === 'spotify') return pathname.includes('/album/');
    if (provider === 'apple-music') return pathname.includes('/album/');
    if (provider === 'amazon-music') return pathname.includes('/albums/');
    if (provider === 'youtube') return url.hostname === 'youtu.be' || (url.hostname.includes('youtube.com') && pathname === '/watch');
  } catch {
    return false;
  }
  return false;
}

function canonicalSourceKey(provider, sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|si$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return `${provider || ''}|${url.toString()}`;
  } catch {
    return `${provider || ''}|${String(sourceUrl || '').trim()}`;
  }
}

function isContinuousYoutubeChapter(route) {
  if (String(route?.provider || '').toLowerCase() !== 'youtube' || !route?.videoId) return false;
  if (!Number.isFinite(Number(route.startSeconds))) return false;
  const evidence = String(route.evidenceType || '').toLowerCase();
  return route.sourceType === 'verified-performance-chapter'
    || Boolean(route.performanceSetId)
    || evidence.includes('chapter');
}

const runtimeSongs = songs.map((song) => {
  const next = { ...song };
  if (song.audioUrl) {
    direct += 1;
    return next;
  }

  const route = routes[song.id];
  if (!route?.provider || (!route.sourceUrl && !route.videoId)) {
    missing.push(song.id);
    return next;
  }

  next.playbackProvider = route.provider;
  next.playbackSourceUrl = route.sourceUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(route.videoId)}`;
  next.playbackSourceType = route.sourceType || 'verified-provider-source';
  const release = releasesById.get(song.releaseId);

  if (next.playbackSourceType === 'verified-release-source') {
    if (isExactTrackUrl(next.playbackProvider, next.playbackSourceUrl)) {
      if (Number(release?.songCount) === 1) {
        next.playbackSourceType = 'verified-track-source';
        exactTrackFallbacks += 1;
      } else {
        next.playbackSourceType = 'verified-release-track-reference';
        releaseTrackReferenceFallbacks += 1;
      }
    } else if (Number(release?.songCount) === 1 && isReleaseSpecificUrl(next.playbackProvider, next.playbackSourceUrl)) {
      next.playbackSourceType = 'verified-single-release-source';
      singleReleaseFallbacks += 1;
    } else if (
      next.playbackProvider === 'youtube'
      && Number(release?.songCount) > 1
      && isReleaseSpecificUrl(next.playbackProvider, next.playbackSourceUrl)
      && !Number.isFinite(Number(route.startSeconds))
    ) {
      next.playbackSourceType = 'verified-unchaptered-youtube-release';
      unchapteredYoutubeReleaseFallbacks += 1;
    }
  } else if (next.playbackSourceType === 'verified-release-track-reference') {
    releaseTrackReferenceFallbacks += 1;
  }

  if (route.videoId) next.youtubeId = route.videoId;
  if (Number.isFinite(Number(route.startSeconds))) {
    next.youtubeStartSeconds = Math.max(0, Math.floor(Number(route.startSeconds)));
  } else {
    delete next.youtubeStartSeconds;
  }

  if (isContinuousYoutubeChapter(route)) {
    next.playbackContainerType = 'youtube-continuous-set';
    next.playbackContainerId = String(route.performanceSetId || route.releaseId || route.videoId);
    next.playbackContainerTitle = String(route.performanceTitle || release?.title || '').trim() || null;
    next.chapterDurationSeconds = Number.isFinite(Number(song.durationSeconds)) ? Number(song.durationSeconds) : null;
    next.durationSeconds = 0;
    continuousYoutubeChapters += 1;
  }

  enriched += 1;
  return next;
});

const exactGroups = new Map();
for (const song of runtimeSongs) {
  if (song.playbackSourceType !== 'verified-track-source' || !song.playbackSourceUrl) continue;
  const key = canonicalSourceKey(song.playbackProvider, song.playbackSourceUrl);
  const group = exactGroups.get(key) || [];
  group.push(song);
  exactGroups.set(key, group);
}

for (const group of exactGroups.values()) {
  const signatures = new Set(group.map((song) => `${song.title || ''}\u0000${song.artist || ''}`));
  if (signatures.size <= 1) continue;
  for (const song of group) {
    song.playbackSourceType = 'verified-release-track-reference';
    song.playbackReferenceUrl = song.playbackSourceUrl;
    delete song.youtubeStartSeconds;
    duplicateExactDowngrades += 1;
  }
}
releaseTrackReferenceFallbacks += duplicateExactDowngrades;

if (missing.length) {
  throw new Error(`${missing.length} songs have no direct audio or verified runtime route. First missing: ${missing.slice(0, 8).join(', ')}`);
}

await writeFile(path.join(root, songsPath), `${JSON.stringify(runtimeSongs, null, 2)}\n`);
console.log(`Enriched runtime catalogue: ${enriched} provider-routed songs, ${direct} direct-audio songs, ${exactTrackFallbacks} exact track fallbacks, ${singleReleaseFallbacks} one-song release fallbacks, ${releaseTrackReferenceFallbacks} release track references (${duplicateExactDowngrades} duplicate exact routes downgraded), ${unchapteredYoutubeReleaseFallbacks} unchaptered multi-song YouTube fallbacks, ${continuousYoutubeChapters} continuous YouTube chapters, ${missing.length} unresolved.`);
