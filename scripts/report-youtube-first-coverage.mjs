import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const songs = JSON.parse(await readFile(path.join(root, 'data/songs.json'), 'utf8'));

const counters = {
  catalogue: songs.length,
  directAudio: 0,
  youtubeExact: 0,
  youtubeChaptered: 0,
  youtubeUntimestamped: 0,
  youtubeUnchapteredManual: 0,
  youtubeReferenceOnly: 0,
  providerMigration: 0,
  noPlaybackRoute: 0,
};
const byGenre = new Map();
const youtubeSourceTypes = new Map();
const migrationProviders = new Map();

function looksYoutube(song) {
  const provider = String(song.playbackProvider || '').toLowerCase();
  const url = String(song.playbackSourceUrl || '').toLowerCase();
  return Boolean(song.youtubeId || provider === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be'));
}

function hasMappedYoutubeStart(song) {
  return Number.isFinite(Number(song.youtubeStartSeconds)) && Number(song.youtubeStartSeconds) >= 0;
}

function bucket(song) {
  if (looksYoutube(song)) {
    if (song.playbackSearchOnly || song.playbackSourceType === 'verified-release-track-reference') return 'youtubeReferenceOnly';
    if (song.playbackSourceType === 'verified-unchaptered-youtube-release') return 'youtubeUnchapteredManual';
    if (song.youtubeId || String(song.playbackSourceUrl || '').trim()) return 'youtubeExact';
  }
  if (song.audioUrl) return 'directAudio';
  if (song.playbackSourceUrl || song.playbackProvider) return 'providerMigration';
  return 'noPlaybackRoute';
}

for (const song of songs) {
  const key = bucket(song);
  counters[key] += 1;

  if (looksYoutube(song)) {
    const sourceType = song.playbackSourceType || 'unspecified';
    youtubeSourceTypes.set(sourceType, (youtubeSourceTypes.get(sourceType) || 0) + 1);
  }
  if (key === 'youtubeExact') {
    if (hasMappedYoutubeStart(song)) counters.youtubeChaptered += 1;
    else counters.youtubeUntimestamped += 1;
  }
  if (key === 'providerMigration') {
    const provider = String(song.playbackProvider || 'unknown').toLowerCase();
    migrationProviders.set(provider, (migrationProviders.get(provider) || 0) + 1);
  }
  if (key === 'directAudio') {
    migrationProviders.set('direct-audio', (migrationProviders.get('direct-audio') || 0) + 1);
  }

  const genre = song.genre || 'unknown';
  if (!byGenre.has(genre)) byGenre.set(genre, { total: 0, youtubePlayable: 0, migration: 0 });
  const row = byGenre.get(genre);
  row.total += 1;
  if (key === 'youtubeExact') row.youtubePlayable += 1;
  else row.migration += 1;
}

const youtubePlayable = counters.youtubeExact;
const migrationBacklog = Math.max(0, counters.catalogue - youtubePlayable);
const percent = counters.catalogue ? youtubePlayable / counters.catalogue * 100 : 0;
const report = {
  generatedAt: new Date().toISOString(),
  ...counters,
  youtubePlayable,
  youtubePlayableCoveragePercent: Number(percent.toFixed(1)),
  migrationBacklog,
  youtubeSourceTypes: Object.fromEntries([...youtubeSourceTypes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  migrationProviders: Object.fromEntries([...migrationProviders.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  genres: Object.fromEntries([...byGenre.entries()].sort(([a], [b]) => a.localeCompare(b))),
  policy: {
    youtubeExact: 'The only executable PlayGarba playback route: an exact controllable YouTube recording through the visible official IFrame player.',
    youtubeChaptered: 'Controllable YouTube route with an explicit mapped start second, including zero.',
    youtubeUntimestamped: 'Controllable YouTube route without a mapped start; inspect source type before calling it exact-song evidence.',
    youtubeUnchapteredManual: 'Verified multi-song YouTube release without an exact selected-song timestamp; migration/reference only.',
    youtubeReferenceOnly: 'YouTube evidence/reference that is not safe for exact playback.',
    providerMigration: 'Apple Music, Spotify, Amazon Music or another provider route retained only as evidence while converting to YouTube.',
    directAudio: 'Rights/provenance evidence only under the YouTube-only product policy; not an executable fallback.',
    noPlaybackRoute: 'No route evidence yet; requires YouTube research.',
  },
};

console.log(JSON.stringify(report, null, 2));
console.error(`YouTube-only playable coverage: ${youtubePlayable}/${counters.catalogue} (${percent.toFixed(1)}%)`);
console.error(`Controllable YouTube routes: ${counters.youtubeExact} (${counters.youtubeChaptered} with mapped starts, ${counters.youtubeUntimestamped} without)`);
console.error(`YouTube migration backlog: ${migrationBacklog}`);
console.error(`Commercial/direct migration sources: ${counters.providerMigration + counters.directAudio}`);
console.error(`YouTube manual/reference backlog: ${counters.youtubeUnchapteredManual + counters.youtubeReferenceOnly}`);
console.error(`No route: ${counters.noPlaybackRoute}`);
