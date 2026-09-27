// Builds the small real-catalogue sample used by the standalone Garbo player prototype.
// Usage: node scripts/lib/build-garbo-prototype-data.mjs
// Output: docs/product/prototypes/garbo/sample.json
//
// The sample is read-only presentation input. It copies canonical fields verbatim and
// never adds tempo, step, taal or credit facts that the catalogue does not hold.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const list = (value, key) => (Array.isArray(value) ? value : value?.[key] || []);
const GENRES = ['traditional', 'dandiya', 'devotional', 'folk', 'sanedo', 'fusion'];
const PER_GENRE = 8;
const GUJARATI = /[઀-૿]/;

const index = await readJson('data/catalogue/index.json');
const genreLabels = new Map((await readJson('data/genres.json')).map((genre) => [genre.id, { id: genre.id, name: genre.name, label: genre.label }]));

const songs = [];
for (const file of index.songChunks) songs.push(...list(await readJson(file), 'songs'));
const releases = new Map();
for (const file of index.releaseChunks) for (const release of list(await readJson(file), 'releases')) releases.set(release.id, release);

// Exact YouTube routes only. Provenance-only rows (Amazon, Spotify, unresolved) are not playable.
const exactRoutes = new Map();
for (const file of index.playbackSources) {
  let data;
  try { data = await readJson(file); } catch { continue; }
  const sources = data?.songSources;
  if (!sources || Array.isArray(sources)) continue;
  for (const [id, source] of Object.entries(sources)) {
    if (source?.provider === 'youtube' && source.videoId && source.playbackRole !== 'provenance-only') exactRoutes.set(id, source.videoId);
  }
}
const isPlayable = (song) => Boolean(song.youtubeId || exactRoutes.has(song.id));

const retired = new Set(index.retiredSongIds || []);

// Recommendation signals and core artists for popularity ranking
const recFiles = index.discovery?.recommendations || [];
const recs = [];
for (const file of recFiles) recs.push(...list(await readJson(file), 'recommendations'));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const recTitles = new Set(recs.map((r) => norm(r.title)));

const artistFiles = index.discovery?.artists || [];
const artists = [];
for (const file of artistFiles) artists.push(...list(await readJson(file), 'artists'));
const coreArtistNames = new Set(artists.filter((a) => a.tier?.includes('core') || a.tier?.includes('headliner') || a.tier?.includes('lead')).map((a) => norm(a.name)));

const ytCount = new Map();
for (const song of songs) {
  const vid = song.youtubeId || exactRoutes.get(song.id);
  if (vid) ytCount.set(vid, (ytCount.get(vid) || 0) + 1);
}

function releaseView(id) {
  const release = releases.get(id);
  if (!release) return null;
  return {
    id: release.id,
    title: release.displayTitle || release.title,
    script: GUJARATI.test(release.title) ? 'gu' : 'latn',
    year: release.originalReleaseYear ?? null
  };
}

function songView(song) {
  const vid = song.youtubeId || exactRoutes.get(song.id) || null;
  const startSec = Number(song.youtubeStartSeconds || 0);
  const isChapter = Boolean(
    startSec > 0
    || (vid && (ytCount.get(vid) || 0) > 1)
  );
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    durationSeconds: Number.isFinite(song.durationSeconds) && song.durationSeconds > 0 ? song.durationSeconds : null,
    release: releaseView(song.releaseId),
    playable: isPlayable(song),
    videoId: vid,
    startSeconds: startSec > 0 ? startSec : 0,
    isChapter: isChapter,
  };
}

function songRank(song) {
  const playable = isPlayable(song);
  if (!playable) return 999999;

  const vid = song.youtubeId || exactRoutes.get(song.id);
  const isStandalone = !vid || (ytCount.get(vid) || 0) <= 1;
  const isRec = recTitles.has(norm(song.title));
  const artistNorm = norm(song.artist);
  const isCoreArtist = [...coreArtistNames].some((name) => artistNorm.includes(name));

  if (isRec && isStandalone) return 10;
  if (isRec) return 20;
  if (isCoreArtist && isStandalone) return 50;
  if (isStandalone) return 100;
  if (isCoreArtist) return 200;
  return 300;
}

const eligible = songs.filter((song) => !retired.has(song.id) && !song.placeholder);
eligible.sort((a, b) => songRank(a) - songRank(b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
const picked = eligible.map(songView);

// Official Nonstop sets with source-published chapters.
const setsIndex = await readJson('data/discovery/sets/index.json');
const sets = [];
for (const chunk of setsIndex.chunks) sets.push(...list(await readJson(path.join('data/discovery/sets', chunk)), 'sets'));
const nonstop = sets
  .filter((set) => set.setType === 'official-nonstop' && set.source?.provider === 'youtube' && set.source.embeddable !== false && Array.isArray(set.segments) && set.segments.length >= 6)
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((set) => {
    const last = set.segments[set.segments.length - 1];
    return {
      id: set.id,
      title: set.title,
      artists: set.artists || [],
      year: set.year ?? null,
      videoId: set.source?.videoId || null,
      durationSeconds: Number.isFinite(last.endSeconds) ? last.endSeconds : null,
      chapters: set.segments.map((segment) => ({ title: segment.title, startSeconds: segment.startSeconds }))
    };
  });

const output = {
  purpose: 'Presentation sample for the standalone Garbo prototype (issue #1649). Not a catalogue source.',
  generatedBy: 'scripts/lib/build-garbo-prototype-data.mjs',
  catalogueVersion: index.version,
  genres: GENRES.map((id) => genreLabels.get(id) || { id, name: id, label: id }),
  songs: picked,
  nonstopSets: nonstop
};

const targets = [
  path.join(root, 'docs/product/prototypes/garbo/sample.json'),
  path.join(root, 'public-site/garbo/prototype/sample.json'),
];
for (const target of targets) {
  await writeFile(target, JSON.stringify(output, null, 2) + '\n');
  console.log(`✓ wrote ${path.relative(root, target)}: ${picked.length} songs (${picked.filter((song) => song.playable).length} playable), ${nonstop.length} Nonstop sets`);
}
