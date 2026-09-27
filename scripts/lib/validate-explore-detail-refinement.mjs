import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../../assets/runtime/explore-search.js', import.meta.url), 'utf8');
const explore = await readFile(new URL('../../src/catalogue/index.html', import.meta.url), 'utf8');
const catalogue = await readFile(new URL('../../src/catalogue/catalogue.js', import.meta.url), 'utf8');
const catalogueCss = await readFile(new URL('../../src/catalogue/catalogue.css', import.meta.url), 'utf8');
const listening = await readFile(new URL('../../src/catalogue/listening-library.js', import.meta.url), 'utf8');
const artistArtworkPayload = JSON.parse(await readFile(new URL('../../data/artist-artwork.json', import.meta.url), 'utf8'));
const catalogueIndex = JSON.parse(await readFile(new URL('../../data/catalogue/index.json', import.meta.url), 'utf8'));
let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

for (const marker of [
  "detail.dataset.releaseFilter = hasActiveRelease ? 'true' : 'false';",
  'showAll.hidden = !hasActiveRelease;',
  'songsEyebrow.textContent = nextEyebrow;',
  "card.setAttribute('aria-current', 'true')",
  'selected-release-context',
  'releaseRail.scrollTo({',
  "behavior: reduced.matches ? 'auto' : 'smooth'",
]) {
  if (!runtime.includes(marker)) fail(`Explore detail behavior is missing: ${marker}`);
}

for (const marker of [
  '.share-explore-state {',
  '.detail-head {',
  '.detail-head::before { display:none; }',
  '.detail-meta span + span::before { content:"·";',
  '.songs-section {',
  '.selected-release-context {',
  '.release-card.active::after {',
  '-webkit-line-clamp:2',
  '.song-context summary {',
  '.song-context-meta span + span::before { content:"·";',
  '.play-link {',
]) {
  if (!catalogueCss.includes(marker)) fail(`Explore source-owned detail presentation is missing: ${marker}`);
}

if (runtime.includes('playgarbaExploreDetailRefinement')) {
  fail('Explore detail presentation must not regress to the retired runtime detail-style island');
}
if (runtime.includes('.detail-head,.release-section,.songs-section{backdrop-filter')) {
  fail('Explore performance runtime must not override detail-surface presentation');
}
if (catalogue.includes('playgarbaExploreShare')) {
  fail('Explore catalogue runtime must not inject share/detail presentation CSS');
}
if (!/\.share-explore-state\s*\{[\s\S]*?width:44px;[\s\S]*?height:44px;/.test(catalogueCss)) {
  fail('Explore Share must retain a 44x44 CSS px effective target in source CSS');
}
if (!/\.detail-meta span\s*\{[^}]*border:0;[^}]*background:transparent;/.test(catalogueCss)) {
  fail('Explore detail metadata must remain flat source-owned text rather than decorative pills');
}

for (const marker of [
  'id="showAllSongs" type="button" class="quiet-button" hidden',
  'id="releaseRail" role="group" aria-label="Albums and releases"',
  'playgarbaExploreRailInteraction',
  "rail.setAttribute('role', 'group');",
  "card.removeAttribute('role')",
  "['ArrowLeft', 'ArrowRight', 'Home', 'End']",
  'focus({ preventScroll: true })',
  'revealHorizontally(rail, next)',
  'pendingReleaseFocusId',
  'data-scroll-left="true"',
  'data-scroll-right="true"',
  "bindRail(rail, 'Essential Garba releases')",
]) {
  if (!explore.includes(marker)) fail(`Explore album-rail interaction is missing: ${marker}`);
}

for (const marker of [
  "import { normalizeSearchText, rankSearchRecords } from '../../assets/runtime/search-core.js';",
  'function exploreSearchRecord(song)',
  'titleAliases: song.aliases',
  'artistAliases: song.artistAliases',
  'function rankExploreSongs(songs, query)',
  'rankSearchRecords(songs.map(exploreSearchRecord), query)',
  'const q = normalizeSearchText(query);',
  'const songs = rankExploreSongs(state.songs, query);',
  'Matching songs, artists, reviewed aliases, styles and releases from the PlayGarba catalogue.',
]) {
  if (!catalogue.includes(marker)) fail(`Explore shared-search integration is missing: ${marker}`);
}
if (/function searchCatalogue\(query[\s\S]*?terms\.every\(\(term\)=>text\.includes\(term\)\)/.test(catalogue)) {
  fail('Explore search must not regress to its independent term-substring matcher');
}

for (const marker of [
  'function replaceDetailMeta(values = [])',
  'function renderCollectionDetailIdentity(collection = state.active)',
  'function renderReleaseDetailIdentity(release, songs)',
  "els.detailKicker.textContent = `${state.active.title} · Release`;",
  'els.detailTitle.textContent = displayTitle(release);',
  'els.detailDescription.textContent = releaseDescription(release, songs);',
  "'Selected release'",
  'renderReleaseDetailIdentity(release, songs);',
  'renderCollectionDetailIdentity(state.active);',
  "rail.setAttribute('role','group');",
]) {
  if (!catalogue.includes(marker)) fail(`Explore release-detail identity is missing: ${marker}`);
}

for (const marker of [
  "taxonomy: '../data/taxonomy.json'",
  'const displayTitle = (entity)',
  'const taxonomyIdsForSong = (song)',
  'const belongsToVisualGenre = (song, genreId)',
  'function songDescription(song, release)',
  'function releaseDescription(release, songs = [])',
  'function makeSongContext(song, release)',
  "details.className = 'song-context';",
  "summary.textContent = 'About';",
  'song.description',
  'song.story',
  'song.displayTitle',
  '...aliasesFor(song)',
  "test:(song)=>belongsToVisualGenre(song,genre.id)",
  'songHasTaxonomy(song,taxonomyIds)',
]) {
  if (!catalogue.includes(marker)) fail(`Explore catalogue metadata refinement is missing: ${marker}`);
}

for (const marker of [
  'playgarbaReleaseHero',
  "hero.className = 'release-hero-art';",
  "releaseRail.querySelector('.release-card.active[data-release-id]')",
  "entry?.verified !== true || !entry.imageUrl",
  "detailHead.dataset.releaseArtwork = 'true';",
  'delete detailHead.dataset.releaseArtwork;',
  'hero.replaceChildren();',
  'grid-template-columns:84px minmax(0,1fr)!important',
  'grid-template-columns:72px minmax(0,1fr)!important',
  'grid-template-areas:"art kicker" "art title" "desc desc" "meta meta"',
  "img.fetchPriority = 'high';",
  "img.addEventListener('error', () => {",
]) {
  if (!listening.includes(marker)) fail(`Verified release hero is missing: ${marker}`);
}

for (const marker of [
  'playgarbaSelectedTracklist',
  'data-selected-tracklist="true"',
  '.collection-detail[data-selected-tracklist="true"] .song-release{display:none!important}',
  '.collection-detail[data-selected-tracklist="true"] .song-row{grid-template-columns:52px minmax(0,1fr) auto!important}',
  '.collection-detail[data-selected-tracklist="true"] .selected-release-context{display:none!important}',
  "detail.dataset.selectedTracklist = 'true';",
  'delete detail.dataset.selectedTracklist;',
  "songList.setAttribute('aria-label', `${releaseTitle} songs`);",
  "songList.setAttribute('aria-label', 'Catalogue songs');",
  "songSectionTitle.textContent = 'Songs';",
  'grid-template-columns:42px minmax(0,1fr) 44px!important',
]) {
  if (!listening.includes(marker)) fail(`Selected release tracklist cleanup is missing: ${marker}`);
}

for (const marker of [
  'playgarbaArtistIdentity',
  'artist-collection-card',
  'artist-card-portrait',
  'artist-detail-portrait',
  'artist-photo-credit',
  "entry?.verified === true && entry.imageUrl",
  "detailHead.dataset.artistArtwork = 'true';",
  'delete detailHead.dataset.artistArtwork;',
  "fetchJson('../data/artist-artwork.json', { artists: {} })",
  'artist.garbaFootprint',
  'artist.notable',
  "credit.target = '_blank';",
  "credit.rel = 'noopener noreferrer';",
]) {
  if (!listening.includes(marker)) fail(`Artist identity experience is missing: ${marker}`);
}

if (!catalogue.includes('state.artists.forEach((artist, index) => {')) {
  fail('Explore must build artist collections from the full discovery artist set');
}
if (catalogue.includes('state.artists.slice(0, 24)')) {
  fail('Explore artist collections must not regress to the legacy 24-artist cap');
}

const discoveryArtistIds = new Set();
for (const file of catalogueIndex?.discovery?.artists || []) {
  const payload = JSON.parse(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));
  for (const artist of payload?.artists || []) {
    if (artist?.id) discoveryArtistIds.add(artist.id);
  }
}

const artistArtwork = artistArtworkPayload?.artists || {};
if (!Object.keys(artistArtwork).length) fail('Artist portrait registry must contain at least one audited portrait');
for (const [artistId, entry] of Object.entries(artistArtwork)) {
  if (!discoveryArtistIds.has(artistId)) fail(`Artist portrait registry contains unknown discovery artist: ${artistId}`);
  if (entry?.verified !== true) fail(`Artist portrait must be explicitly verified: ${artistId}`);
  for (const field of ['imageUrl', 'sourcePage', 'license', 'licenseUrl', 'attribution', 'sourceType']) {
    if (!String(entry?.[field] || '').trim()) fail(`Artist portrait ${artistId} is missing ${field}`);
  }
  for (const field of ['imageUrl', 'sourcePage', 'licenseUrl']) {
    if (!String(entry?.[field] || '').startsWith('https://')) fail(`Artist portrait ${artistId} ${field} must use HTTPS`);
  }
  if (!/^CC BY(?:-SA)? \d(?:\.\d)?$/.test(String(entry?.license || ''))) {
    fail(`Artist portrait ${artistId} uses an unapproved or unclear licence label: ${entry?.license || 'missing'}`);
  }
}

for (const marker of [
  'function artistCreditMatches(creditValue, names)',
  'paddedCredit.includes(` ${name} `)',
  'test:(song)=>artistCreditMatches(song.artist, names)',
  'function trustedTrackNumber(song)',
  'Number.isInteger(value) && value > 0',
  'function trustedReleaseSequence(songs)',
  'pairs.some(({ trackNumber }) => trackNumber == null)',
  'unique.size !== pairs.length',
  'function orderedReleaseSongs(songs)',
  "sequence.className = 'song-art fallback song-track-number';",
  "row.dataset.trackNumber = String(trackNumber);",
  'const songs = orderedReleaseSongs(state.activeSongs.filter',
  "const emptyQuery = state.active?.id === 'search' ? els.search.value.trim() : '';",
  '? `No songs found for “${emptyQuery}”. Try another artist, song or release.`',
]) {
  if (!catalogue.includes(marker)) fail(`Explore truthful discovery is missing: ${marker}`);
}

if (catalogue.includes('return names.some((name)=>credit.includes(name));')) {
  fail('Artist Essentials must not use loose substring credit matching');
}
if (catalogue.includes("sequence.textContent = String(index + 1)")) {
  fail('Selected release track numbers must never be fabricated from render position');
}
if (catalogue.includes("row.dataset.trackNumber = String(index + 1)")) {
  fail('Selected release data-track-number must never be fabricated from render position');
}

const inlineModules = [...explore.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
if (!inlineModules.length) fail('Explore must retain its inline interaction/atmosphere modules');
inlineModules.forEach((source, index) => {
  try {
    new Function(source);
  } catch (error) {
    fail(`Explore inline module ${index + 1} has invalid JavaScript: ${error.message}`);
  }
});

try {
  new Function(listening);
} catch (error) {
  fail(`Explore listening/release-detail runtime has invalid JavaScript: ${error.message}`);
}

if (runtime.includes("active.scrollIntoView(")) {
  fail('Selected release reveal must stay horizontal-only and must not use scrollIntoView');
}
if (explore.includes('releaseRail.scrollIntoView(') || explore.includes('next.scrollIntoView(')) {
  fail('Album-rail keyboard navigation must never use two-axis scrollIntoView');
}
if (explore.includes('id="releaseRail" role="list"')) {
  fail('Interactive album rail must preserve native button semantics instead of exposing list-only semantics');
}
if (catalogue.includes("button.setAttribute('role','listitem');")) {
  fail('Release buttons must keep native button semantics in the source runtime');
}
if (listening.includes("entry?.verified !== false") || listening.includes("entry?.imageUrl && entry?.verified !== false")) {
  fail('Large release hero artwork must require explicitly verified artwork');
}
if (listening.includes('release-hero-art fallback')) {
  fail('Release hero must stay text-only when verified artwork is unavailable instead of enlarging a fallback');
}

if (failed) process.exit(1);
console.log('✓ Explore detail hierarchy, verified release and artist artwork, full artist discovery, truthful tracklists, rich metadata, taxonomy browsing, album semantics and keyboard navigation are protected');
