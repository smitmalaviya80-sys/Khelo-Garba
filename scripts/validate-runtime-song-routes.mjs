import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));
let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

const [songs, releases, coverage, fastRuntime, providerRuntime, youtubeRuntime, continuityRuntime, app] = await Promise.all([
  readJson('data/songs.json'),
  readJson('data/releases.json'),
  readJson('data/playback-coverage.json'),
  read('simple-runtime.js'),
  read('provider-runtime.js'),
  read('youtube-player-runtime.js'),
  read('player-continuity.js'),
  read('app.js'),
]);
const releasesById = new Map(releases.map((release) => [release.id, release]));

function isExactTrackUrl(song) {
  try {
    const url = new URL(song.playbackSourceUrl || song.playbackReferenceUrl || '');
    const pathname = url.pathname.toLowerCase();
    if (song.playbackProvider === 'spotify') return /\/(?:intl-[^/]+\/)?track\/[^/]+/.test(pathname);
    if (song.playbackProvider === 'apple-music') return pathname.includes('/song/') || url.searchParams.has('i');
    if (song.playbackProvider === 'amazon-music') return /\/tracks\/[^/]+/.test(pathname) || (pathname.includes('/albums/') && Boolean(url.searchParams.get('trackAsin')));
  } catch {
    return false;
  }
  return false;
}

function isReleaseSpecificUrl(song) {
  try {
    const url = new URL(song.playbackSourceUrl || '');
    const pathname = url.pathname.toLowerCase();
    if (song.playbackProvider === 'spotify') return pathname.includes('/album/');
    if (song.playbackProvider === 'apple-music') return pathname.includes('/album/');
    if (song.playbackProvider === 'amazon-music') return pathname.includes('/albums/');
    if (song.playbackProvider === 'youtube') return url.hostname === 'youtu.be' || (url.hostname.includes('youtube.com') && pathname === '/watch');
  } catch {
    return false;
  }
  return false;
}

function canonicalSourceKey(song) {
  const raw = song.playbackSourceUrl || song.playbackReferenceUrl || '';
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|si$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return `${song.playbackProvider || ''}|${url.toString()}`;
  } catch {
    return `${song.playbackProvider || ''}|${String(raw).trim()}`;
  }
}

const missing = songs.filter((song) => !song.audioUrl && (!song.playbackProvider || !song.playbackSourceUrl));
const directRoutes = songs.filter((song) => Boolean(song.audioUrl));
const chapterRoutes = songs.filter((song) => song.playbackSourceType === 'verified-performance-chapter');
const exactTrackRoutes = songs.filter((song) => song.playbackSourceType === 'verified-track-source');
const singleReleaseRoutes = songs.filter((song) => song.playbackSourceType === 'verified-single-release-source');
const releaseTrackReferenceRoutes = songs.filter((song) => song.playbackSourceType === 'verified-release-track-reference');
const unchapteredYoutubeRoutes = songs.filter((song) => song.playbackSourceType === 'verified-unchaptered-youtube-release');
const timestampedYoutubeRoutes = songs.filter((song) => (
  song.playbackProvider === 'youtube'
  && song.youtubeId
  && Number.isFinite(Number(song.youtubeStartSeconds))
  && Number(song.youtubeStartSeconds) >= 0
  && song.playbackSourceType !== 'verified-unchaptered-youtube-release'
  && song.playbackSourceType !== 'verified-release-track-reference'
));
const exactSelectionIds = new Set([
  ...directRoutes.map((song) => song.id),
  ...timestampedYoutubeRoutes.map((song) => song.id),
  ...exactTrackRoutes.map((song) => song.id),
  ...singleReleaseRoutes.map((song) => song.id),
]);
const releaseBrowseOnlyRoutes = songs.filter((song) => !exactSelectionIds.has(song.id) && !missing.some((missingSong) => missingSong.id === song.id));

const misclassifiedExactTracks = songs.filter((song) => song.playbackSourceType === 'verified-release-source' && isExactTrackUrl(song));
const misclassifiedSingleReleases = songs.filter((song) => {
  if (song.playbackSourceType !== 'verified-release-source' || !isReleaseSpecificUrl(song)) return false;
  return Number(releasesById.get(song.releaseId)?.songCount) === 1;
});
const misclassifiedUnchapteredYoutube = songs.filter((song) => {
  if (song.playbackSourceType !== 'verified-release-source' || song.playbackProvider !== 'youtube' || !isReleaseSpecificUrl(song)) return false;
  if (Number.isFinite(Number(song.youtubeStartSeconds))) return false;
  return Number(releasesById.get(song.releaseId)?.songCount) > 1;
});
const brokenReleaseTrackReferences = releaseTrackReferenceRoutes.filter((song) => (
  !isExactTrackUrl(song)
  || Number.isFinite(Number(song.youtubeStartSeconds))
));
const brokenUnchapteredYoutube = unchapteredYoutubeRoutes.filter((song) => {
  if (song.playbackProvider !== 'youtube' || !isReleaseSpecificUrl(song)) return true;
  if (Number.isFinite(Number(song.youtubeStartSeconds))) return true;
  return Number(releasesById.get(song.releaseId)?.songCount) <= 1;
});
const brokenChapters = chapterRoutes.filter((song) => song.playbackProvider !== 'youtube' || !song.youtubeId || !Number.isFinite(Number(song.youtubeStartSeconds)) || Number(song.youtubeStartSeconds) < 0);
const exactShapeProviders = new Set(['spotify', 'apple-music', 'amazon-music']);
const malformedExactTrackRoutes = exactTrackRoutes.filter((song) => exactShapeProviders.has(song.playbackProvider) && !isExactTrackUrl(song));
const rutviGeneratedPerformanceRoutes = songs.filter((song) => (
  String(song.artist || '').trim().toLowerCase() === 'rutvi pandya'
  && song.playbackSourceType === 'verified-performance-chapter'
));

const exactGroups = new Map();
for (const song of exactTrackRoutes) {
  const key = canonicalSourceKey(song);
  const group = exactGroups.get(key) || [];
  group.push(song);
  exactGroups.set(key, group);
}
const duplicatedExactGroups = [...exactGroups.values()].filter((group) => (
  new Set(group.map((song) => `${song.title || ''}\u0000${song.artist || ''}`)).size > 1
));

const providers = new Map();
for (const song of songs) {
  if (!song.playbackProvider) continue;
  providers.set(song.playbackProvider, (providers.get(song.playbackProvider) || 0) + 1);
}

if (missing.length) fail(`${missing.length} generated songs are missing source evidence fields (first: ${missing.slice(0, 5).map((song) => song.id).join(', ')})`);
if (brokenChapters.length) fail(`${brokenChapters.length} performance-chapter routes lost their YouTube ID or start time`);
if (misclassifiedExactTracks.length) fail(`${misclassifiedExactTracks.length} exact-shaped provider track URLs are still labelled as release-level fallbacks instead of track references`);
if (misclassifiedSingleReleases.length) fail(`${misclassifiedSingleReleases.length} one-song release URLs are still labelled as multi-track release fallbacks`);
if (misclassifiedUnchapteredYoutube.length) fail(`${misclassifiedUnchapteredYoutube.length} unchaptered multi-song YouTube routes are still allowed to look like exact song playback`);
if (brokenReleaseTrackReferences.length) fail(`${brokenReleaseTrackReferences.length} release track references do not preserve a track-shaped evidence URL or incorrectly retain a timestamp`);
if (malformedExactTrackRoutes.length) fail(`${malformedExactTrackRoutes.length} exact provider evidence routes do not point to provider-specific track selections (first: ${malformedExactTrackRoutes.slice(0, 5).map((song) => song.id).join(', ')})`);
if (rutviGeneratedPerformanceRoutes.length) fail(`${rutviGeneratedPerformanceRoutes.length} Rutvi Pandya songs still depend on the generic title-only performance matcher (first: ${rutviGeneratedPerformanceRoutes.slice(0, 5).map((song) => song.id).join(', ')})`);
if (duplicatedExactGroups.length) {
  const sample = duplicatedExactGroups.slice(0, 3).map((group) => `${group.length} songs → ${group[0].playbackSourceUrl}`).join('; ');
  fail(`${duplicatedExactGroups.length} exact-track URL group(s) still map one provider track to different songs (${sample})`);
}
if (brokenUnchapteredYoutube.length) fail(`${brokenUnchapteredYoutube.length} unchaptered YouTube routes do not match the multi-song release contract`);
if (coverage.songCount !== songs.length) fail(`Playback coverage songCount ${coverage.songCount} does not match ${songs.length} generated songs`);
if (coverage.unresolvedWithoutVerifiedReleaseSource !== 0) fail(`Playback coverage still reports ${coverage.unresolvedWithoutVerifiedReleaseSource} unresolved songs`);
if (!Number.isFinite(Number(coverage.verifiedReleaseTrackReference))) fail('Playback coverage must report verifiedReleaseTrackReference separately');
if (Number(coverage.verifiedReleaseTrackReference) > releaseTrackReferenceRoutes.length) {
  fail(`Build coverage reports ${coverage.verifiedReleaseTrackReference} release track references but runtime has only ${releaseTrackReferenceRoutes.length}`);
}

for (const marker of [
  'function applyYoutubeOnlyPolicy(song)',
  'delete safe.audioUrl;',
  "safe.playbackProvider = 'youtube';",
  "safe.playbackSourceType = 'youtube-migration-pending';",
  'YouTube source not mapped yet.',
  "Object.defineProperty(window, 'GARBA_YOUTUBE_PLAYER'",
  'window.GARBA_YOUTUBE_ONLY_POLICY',
]) if (!providerRuntime.includes(marker)) fail(`YouTube-only policy runtime missing marker: ${marker}`);

for (const prohibited of [
  'Tap the YouTube button to open this track.',
  'let youtubeUnlocked = false;',
  'function installYoutubeApiGate(api)',
  'youtubeVideoButton',
  'function injectYoutubeControl()',
  'function toggleYoutubeStagePresentation()',
  'Show YouTube video',
]) if (providerRuntime.includes(prohibited)) fail(`Main Play/Pause must be the only required YouTube playback control: ${prohibited}`);

for (const marker of [
  "if (!target.closest('#playButton, #miniPlay')) return;",
  "if (playerState === states().PLAYING || playerState === states().BUFFERING) player.pauseVideo();",
  "open(song, { autoplay: true });",
  "document.addEventListener('click', captureClick, { capture: true });",
  "$('youtubeDockStop')?.addEventListener('click', () => close());",
]) if (!youtubeRuntime.includes(marker)) fail(`YouTube player runtime missing one-control/persistent-stage marker: ${marker}`);

for (const marker of [
  'open.spotify.com/embed',
  'embed.music.apple.com',
  'w.soundcloud.com/player',
  'Continue on ${name}',
]) if (providerRuntime.includes(marker)) fail(`YouTube-only runtime still contains executable provider fallback marker: ${marker}`);

for (const marker of [
  "song.playbackSourceType === 'verified-release-track-reference'",
  "song.playbackSourceType !== 'verified-track-source'",
  'playbackSearchOnly = true',
  'Exact track source not mapped',
  'The wrong recording will not be autoplayed.',
  'Release reference only · exact selected song not verified',
  'Search ${name}',
  'sanitisePlaybackRoutes',
]) if (!continuityRuntime.includes(marker)) fail(`Playback safety runtime missing route-truth marker: ${marker}`);

for (const marker of [
  'const bootGenres = [',
  'const bootSongs = [',
  'window.fetch = (input, init) =>',
  "nativeFetch('data/songs.json'",
  'bootSongs.splice(0, bootSongs.length, ...songs)',
  "requestIdleCallback(run, { timeout: 2600 })",
  'provider-runtime.js',
  'player-continuity.js',
]) if (!fastRuntime.includes(marker)) fail(`Fast startup runtime missing marker: ${marker}`);

const providerBootIndex = fastRuntime.indexOf('provider-runtime.js');
const continuityBootIndex = fastRuntime.indexOf('player-continuity.js');
if (providerBootIndex < 0 || continuityBootIndex < 0 || continuityBootIndex < providerBootIndex) {
  fail('Fast startup runtime must load YouTube-only policy before player-continuity.js');
}

for (const marker of [
  'const SEARCH_RESULT_LIMIT = 160;',
  "sheetSummary: $('sheetSummary')",
  'state.sheetMatchCount = state.songs.length;',
  "if (state.sheetMode === 'search' && songs.length > SEARCH_RESULT_LIMIT) return songs.slice(0, SEARCH_RESULT_LIMIT);",
  "state.sheetMode === 'search' && !query",
  'Keep typing to narrow the list.',
  "if (event.key === '/')",
  "openSheet('search', { trigger: els.searchButton });",
]) if (!app.includes(marker)) fail(`Large-catalogue browser missing bounded-search marker: ${marker}`);

if (failed) process.exit(1);
console.log(`✓ all ${songs.length} generated songs retain verified source evidence for catalogue migration`);
console.log(`✓ ${timestampedYoutubeRoutes.length} YouTube routes select a verified video/timestamp`);
console.log(`✓ ${chapterRoutes.length} verified live/performance routes preserve their mapped chapter start`);
console.log(`✓ ${releaseTrackReferenceRoutes.length} songs remain explicitly blocked from false exact playback because their source is reference-only`);
console.log(`✓ ${directRoutes.length} direct-audio entries remain catalogue evidence but the runtime policy removes them as executable playback routes`);
console.log(`✓ ${exactTrackRoutes.length} exact commercial-provider mappings remain migration evidence after duplicate-route safety checks`);
console.log(`✓ ${singleReleaseRoutes.length} one-song release evidence entries preserve truthful source classification`);
console.log(`✓ ${unchapteredYoutubeRoutes.length} unchaptered multi-song YouTube routes remain manual/reference-only until exact boundaries are verified`);
console.log(`✓ source-evidence distribution: ${[...providers.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}=${count}`).join(', ')}`);
console.log('✓ provider-runtime enforces YouTube-only execution with one-tap main Play/Pause and no secondary YouTube playback button');
console.log('✓ unrelated document clicks do not dismiss the YouTube stage; Stop remains an explicit close action');
console.log('✓ Spotify, Apple Music, Amazon Music and other commercial-provider source evidence cannot become executable runtime fallbacks');
console.log('✓ duplicate exact-track URLs cannot map to different song identities');
console.log('✓ route-truth sanitisation still runs before YouTube playback decisions');
console.log('✓ first interaction uses the embedded fast catalogue while the full catalogue hydrates after load');
console.log('✓ blank Search avoids building the full catalogue DOM and broad queries cap rendered rows at 160');
console.log('✓ the advertised / keyboard shortcut opens Search');
