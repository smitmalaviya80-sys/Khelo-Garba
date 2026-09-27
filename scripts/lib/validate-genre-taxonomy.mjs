import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadDiscoverySets } from './load-discovery-sets.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));

const [genres, taxonomy, index, playerRuntime, catalogueRuntime, nonstopRuntime] = await Promise.all([
  readJson('data/genres.json'),
  readJson('data/taxonomy.json'),
  readJson('data/catalogue/index.json'),
  read('app.js'),
  read('src/catalogue/catalogue.js'),
  read('nonstop-browser.js'),
]);
const songParts = await Promise.all((index.songChunks || []).map(readJson));
const songs = songParts.flat();
const { sets: nonstop } = await loadDiscoverySets(root, index);

let failed = false;
const fail = (message) => {
  console.error(`✗ ${message}`);
  failed = true;
};

const visualIds = new Set(genres.map((genre) => String(genre.id || '').trim()).filter(Boolean));
const taxonomyById = new Map(taxonomy.map((entry) => [String(entry.id || '').trim(), entry]));

if (visualIds.size !== genres.length) fail('Visual genre IDs must be unique and non-empty');
if (taxonomyById.size !== taxonomy.length) fail('Music taxonomy IDs must be unique and non-empty');

for (const entry of taxonomy) {
  if (!visualIds.has(entry.visualGenre)) {
    fail(`Taxonomy ${entry.id} maps to unknown visual genre ${JSON.stringify(entry.visualGenre)}`);
  }
}

let secondaryTaxonomySongs = 0;
let secondaryTaxonomyTags = 0;
for (const song of songs) {
  if (!visualIds.has(song.genre)) fail(`Song ${song.id} has unknown visual genre ${JSON.stringify(song.genre)}`);
  if (!song.category || !taxonomyById.has(song.category)) {
    fail(`Song ${song.id} has unknown or missing primary category ${JSON.stringify(song.category)}`);
  } else {
    const expected = taxonomyById.get(song.category)?.visualGenre;
    if (expected !== song.genre) {
      fail(`Song ${song.id} primary category ${song.category} maps to ${expected}, but visual genre is ${song.genre}`);
    }
  }

  if (song.taxonomyStyles == null) continue;
  if (!Array.isArray(song.taxonomyStyles)) {
    fail(`Song ${song.id} taxonomyStyles must be an array when present`);
    continue;
  }

  const seen = new Set();
  for (const style of song.taxonomyStyles) {
    if (!taxonomyById.has(style)) fail(`Song ${song.id} has unknown secondary taxonomy style ${JSON.stringify(style)}`);
    if (style === song.category) fail(`Song ${song.id} repeats primary category ${style} in taxonomyStyles[]`);
    if (seen.has(style)) fail(`Song ${song.id} repeats secondary taxonomy style ${style}`);
    seen.add(style);
  }
  if (seen.size) {
    secondaryTaxonomySongs += 1;
    secondaryTaxonomyTags += seen.size;
  }
}

let discoveryGenreTags = 0;
let discoveryStyleTags = 0;
let discoveryCategoryTags = 0;
for (const set of nonstop) {
  const setGenres = Array.isArray(set.genres) ? set.genres : [];
  for (const genre of setGenres) {
    discoveryGenreTags += 1;
    if (!visualIds.has(genre)) fail(`Nonstop set ${set.id} mixes non-visual token ${JSON.stringify(genre)} into genres[]`);
  }
  const styles = Array.isArray(set.styles) ? set.styles : [];
  for (const style of styles) {
    discoveryStyleTags += 1;
    if (!taxonomyById.has(style)) fail(`Nonstop set ${set.id} has unknown taxonomy style ${JSON.stringify(style)}`);
  }
  for (const category of Array.isArray(set.categories) ? set.categories : []) {
    discoveryCategoryTags += 1;
    if (!visualIds.has(category) && !taxonomyById.has(category)) {
      fail(`Nonstop set ${set.id} has unknown discovery category ${JSON.stringify(category)}`);
    }
  }
}

if (!playerRuntime.includes('song.taxonomyStyles')) {
  fail('Main player search must index taxonomyStyles[]');
}
if (!catalogueRuntime.includes('song.taxonomyStyles')) {
  fail('Explore search must index taxonomyStyles[]');
}

// The player is a presentation/play-context surface: its genre rail must stay keyed
// to the canonical primary visual world. Secondary taxonomy is searchable, but must
// not silently broaden automatic player continuation or rewrite primary identity.
const playerGenreFilter = playerRuntime.match(/const songsForGenre = \(genreId\) =>[^;]+;/)?.[0] || '';
if (!playerGenreFilter) {
  fail('Main player must define a bounded songsForGenre() primary-world filter');
} else {
  if (!playerGenreFilter.includes('song.genre === genreId')) {
    fail('Main player genre membership must filter by canonical song.genre');
  }
  if (/taxonomyStyles|song\.category|browseVisualGenres|taxonomyIdsForSong/.test(playerGenreFilter)) {
    fail('Main player genre membership must not broaden from secondary taxonomy');
  }
}
if (!playerRuntime.includes('state.genreId = song.genre')) {
  fail('Selecting a song must keep state.genreId aligned to the song primary visual genre');
}
if (!playerRuntime.includes('state.playContextGenreId = song.genre')) {
  fail('Player continuation context must anchor to the selected song primary visual genre');
}
if (!playerRuntime.includes('const list = songsForGenre(genreId)')) {
  fail('Automatic player continuation must consume the primary-world songsForGenre() list');
}

// Explore is deliberately broader: verified category + taxonomyStyles[] may add a
// song to additional visual browse collections without changing song.genre.
const exploreBrowseFunction = catalogueRuntime.match(/const browseVisualGenres = \(song\) => \{[\s\S]*?\n\};/)?.[0] || '';
if (!exploreBrowseFunction) {
  fail('Explore must define browseVisualGenres() for broader discovery membership');
} else {
  if (!exploreBrowseFunction.includes('song?.genre ? [song.genre] : []')) {
    fail('Explore browse membership must preserve the primary song.genre visual world');
  }
  if (!exploreBrowseFunction.includes('taxonomyIdsForSong(song)')) {
    fail('Explore browse membership must include verified primary/secondary taxonomy IDs');
  }
  if (!exploreBrowseFunction.includes('state.taxonomyById.get(id)?.visualGenre')) {
    fail('Explore taxonomy browse membership must resolve through canonical taxonomy visualGenre mappings');
  }
}

const structuredNonstopSets = nonstop.filter((set) => [set.genres, set.categories, set.styles]
  .some((values) => Array.isArray(values) && values.length > 0)).length;
const legacyFallbackSets = nonstop.length - structuredNonstopSets;

for (const entry of taxonomy) {
  const pair = `['${entry.id}', '${entry.visualGenre}']`;
  if (!nonstopRuntime.includes(pair)) {
    fail(`Nonstop runtime taxonomy mapping is missing canonical pair ${pair}`);
  }
}

const fallbackFunction = nonstopRuntime.match(/function categoryFallbackText\(set\) \{[\s\S]*?\n  \}/)?.[0] || '';
if (!fallbackFunction) {
  fail('Nonstop runtime must define the narrow categoryFallbackText() helper');
} else {
  if (/artistsText/.test(fallbackFunction)) fail('Nonstop category fallback must not scan artist names');
  if (/segments/.test(fallbackFunction)) fail('Nonstop category fallback must not scan chapter/segment titles');
}

const categoryFunction = nonstopRuntime.match(/function categoriesFor\(set\) \{[\s\S]*?\n  \}/)?.[0] || '';
if (!categoryFunction) {
  fail('Nonstop runtime must define categoriesFor()');
} else {
  if (categoryFunction.includes('setSearchText(')) fail('Nonstop category membership must not reuse broad search text');
  if (!categoryFunction.includes('if (structured.size > 0)')) fail('Nonstop structured taxonomy must take precedence over legacy fallback');
  if (!categoryFunction.includes('addStructuredBrowseCategories(categories, structured)')) fail('Nonstop runtime must map structured browse tokens before fallback');
  if (!categoryFunction.includes('addLegacyFallbackCategories(categories, fallbackText')) fail('Nonstop runtime must keep a bounded fallback for unclassified legacy sets');
}

if (failed) process.exit(1);
console.log(`✓ ${visualIds.size} visual worlds and ${taxonomyById.size} music taxonomy categories have clean IDs and mappings`);
console.log(`✓ ${songs.length} canonical songs have primary taxonomy categories aligned with their visual worlds`);
console.log(`✓ ${secondaryTaxonomySongs} songs preserve ${secondaryTaxonomyTags} secondary taxonomy classifications without overloading the primary category`);
console.log(`✓ ${nonstop.length} canonical discovery Nonstop sets keep ${discoveryGenreTags} genre tags, ${discoveryStyleTags} style tags, and ${discoveryCategoryTags} browse categories inside known visual/taxonomy IDs`);
console.log('✓ player genre selection/continuation stays anchored to canonical song.genre while secondary taxonomy remains searchable');
console.log('✓ Explore preserves primary genre identity while allowing verified taxonomy to broaden discovery membership');
console.log(`✓ Nonstop browse membership is structured-first for ${structuredNonstopSets} sets, with narrow set-level fallback retained for ${legacyFallbackSets} legacy unclassified sets`);
