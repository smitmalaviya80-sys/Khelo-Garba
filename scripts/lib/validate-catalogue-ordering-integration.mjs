import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalogue = fs.readFileSync('src/catalogue/catalogue.js', 'utf8');
const indexHtml = fs.readFileSync('src/catalogue/index.html', 'utf8');
const catalogueCss = fs.readFileSync('src/catalogue/catalogue.css', 'utf8');
const readinessSource = fs.readFileSync('assets/runtime/route-readiness.js', 'utf8');
const orderingSource = fs.readFileSync('src/catalogue/catalogue-ordering.js', 'utf8');
const orderingRuntime = fs.readFileSync('assets/runtime/catalogue-ordering.js', 'utf8');

assert.equal(orderingRuntime, orderingSource, 'browser ordering runtime mirror must stay byte-identical to the pure source helper');

const readinessSandbox = { URL, window: {} };
vm.runInNewContext(readinessSource, readinessSandbox, { filename: 'assets/runtime/route-readiness.js' });
const { routeReadiness } = readinessSandbox.window.GARBA_ROUTE_READINESS;

const orderingSandbox = {};
vm.runInNewContext(orderingSource, orderingSandbox, { filename: 'src/catalogue/catalogue-ordering.js' });
const { orderCatalogueSongs } = orderingSandbox.PlayGarbaCatalogueOrdering;

const makePlayable = (id, title, youtubeId) => ({
  id,
  title,
  artist: 'Artist',
  playbackProvider: 'youtube',
  youtubeId,
  playbackSourceUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
  playbackSourceType: 'official-artist-channel',
});
const olderPlayable = makePlayable('older-playable', 'Older playable', 'abc123xyz00');
const newerPlayable = makePlayable('newer-playable', 'Newer playable', 'def123xyz00');
const referenceOnly = {
  id: 'reference-only',
  title: 'Reference only',
  artist: 'Artist',
  playbackProvider: 'youtube',
  youtubeId: 'ref123xyz00',
  playbackSourceUrl: 'https://www.youtube.com/watch?v=ref123xyz00',
  playbackSourceType: 'verified-release-track-reference',
};
const sourceOrder = [referenceOnly, olderPlayable, newerPlayable];
const tier = (song) => routeReadiness(song).executable ? 0 : 1;
const chronology = new Map([
  ['older-playable', 1995],
  ['newer-playable', '2026-09-01'],
  ['reference-only', '2027-01-01'],
]);

const playableFirst = orderCatalogueSongs(sourceOrder, {
  context: 'browse',
  mode: 'popular',
  availabilityGate: true,
  getAvailabilityTier: tier,
});
assert.deepEqual(playableFirst.slice(0, 2).map(({ id }) => id).sort(), ['newer-playable', 'older-playable'], 'ordinary browse must put executable recordings before unavailable rows');

const newest = orderCatalogueSongs(sourceOrder, {
  context: 'browse',
  mode: 'newest',
  availabilityGate: true,
  getAvailabilityTier: tier,
  getChronology: (song) => chronology.get(song.id),
});
assert.deepEqual(newest.map(({ id }) => id), ['newer-playable', 'older-playable', 'reference-only'], 'Newest must keep availability first, then descending chronology');

const oldest = orderCatalogueSongs(sourceOrder, {
  context: 'browse',
  mode: 'oldest',
  availabilityGate: true,
  getAvailabilityTier: tier,
  getChronology: (song) => chronology.get(song.id),
});
assert.deepEqual(oldest.map(({ id }) => id), ['older-playable', 'newer-playable', 'reference-only'], 'Oldest must keep availability first, then ascending chronology');
assert.deepEqual(sourceOrder.map(({ id }) => id), ['reference-only', 'older-playable', 'newer-playable'], 'ordering must not mutate caller data');

for (const context of ['search', 'selected-release', 'nonstop']) {
  const protectedOrder = orderCatalogueSongs(sourceOrder, {
    context,
    mode: 'newest',
    availabilityGate: true,
    getAvailabilityTier: tier,
    getChronology: (song) => chronology.get(song.id),
  });
  assert.deepEqual(protectedOrder.map(({ id }) => id), sourceOrder.map(({ id }) => id), `${context} order must remain source-truthful`);
}

assert.match(catalogue, /import '\.\.\/\.\.\/assets\/runtime\/route-readiness\.js';/);
assert.match(catalogue, /globalThis\.PlayGarbaCatalogueOrdering\?\.orderCatalogueSongs \|\| fallbackPlayableFirstOrder/);
assert.match(catalogue, /const CATALOGUE_SORT_DEFAULT = 'playable-first';/);
assert.match(catalogue, /new Set\(\[CATALOGUE_SORT_DEFAULT, 'newest', 'oldest'\]\)/);
assert.match(catalogue, /getChronology: catalogueChronology/);
assert.match(catalogue, /if \(sortMode === CATALOGUE_SORT_DEFAULT\) \{[\s\S]*fallbackPlayableFirstOrder\(songs, \{/);
assert.match(catalogue, /release\?\.originalReleaseYear \|\| release\?\.releaseDate \|\| null/);
assert.match(catalogue, /params\.set\('sort', normalisedSort\)/);
assert.match(catalogue, /els\.sort\?\.addEventListener\('change'/);
assert.match(catalogue, /if \(state\.activeReleaseId\) return 'selected-release';/);
assert.match(catalogue, /if \(state\.active\?\.id === 'search'\) return 'search';/);
assert.match(catalogue, /if \(state\.active\?\.id === 'nonstop'\) return 'nonstop';/);

const orderingScript = indexHtml.indexOf('<script src="../assets/runtime/catalogue-ordering.js"></script>');
const catalogueModule = indexHtml.indexOf('<script type="module" src="catalogue.js"></script>');
assert.ok(orderingScript >= 0 && catalogueModule > orderingScript, 'ordering runtime must load before catalogue.js captures the shared helper');
assert.match(indexHtml, /<option value="playable-first">Playable first<\/option>/);
assert.match(indexHtml, /<option value="newest">Newest<\/option>/);
assert.match(indexHtml, /<option value="oldest">Oldest<\/option>/);
assert.doesNotMatch(indexHtml, /<option[^>]*>\s*Popular\s*<\/option>/i, 'Popular must not be exposed without a reviewed ranking source');
assert.match(catalogueCss, /\/\* Issue #771 catalogue sort control \*\//);
assert.match(catalogueCss, /\.catalogue-sort select/);

const renderStart = catalogue.indexOf("function renderSongs(songs, title='All songs'");
const renderEnd = catalogue.indexOf('\nfunction collectionHash', renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, 'renderSongs body must be present');
const renderBody = catalogue.slice(renderStart, renderEnd);
const orderingCall = renderBody.indexOf('const orderedSongs = orderedSongsForRender(songs);');
const batchSlice = renderBody.indexOf('orderedSongs.slice(0, limit)');
assert.ok(orderingCall >= 0 && batchSlice > orderingCall, 'catalogue ordering must happen before batching');
assert.match(renderBody, /syncSortControl\(\);/);
assert.match(renderBody, /const readiness = routeReadiness\(song\);/);
assert.match(renderBody, /document\.createElement\(readiness\.executable \? 'a' : 'span'\)/);
assert.match(renderBody, /action\.textContent = 'Unavailable';/);
assert.match(renderBody, /aria-disabled/);

console.log('Catalogue browse sort integration validation passed.');
