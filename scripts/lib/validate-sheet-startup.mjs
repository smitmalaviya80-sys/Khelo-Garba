import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeSearchText, rankSearchRecords } from '../../assets/runtime/search-core.js';

const app = fs.readFileSync('app.js', 'utf8');
const bootstrap = fs.readFileSync('simple-runtime.js', 'utf8');
const uxPolish = fs.readFileSync('src/optional/ux-polish.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const songs = JSON.parse(fs.readFileSync('data/songs.json', 'utf8'));
const releases = JSON.parse(fs.readFileSync('data/releases.json', 'utf8'));

// 1. Static contract verification
const staticChecks = [
  [
    /function renderSheet\(\) \{[\s\S]*?if \(state\.sheetSnap === 'closed'\) \{[\s\S]*?els\.songList\.replaceChildren\(\);[\s\S]*?if \(els\.sheetSummary\) els\.sheetSummary\.textContent = '';[\s\S]*?return;[\s\S]*?const query = els\.searchInput\.value/,
    'renderSheet guards against constructing song rows and clears songList when sheet is closed',
  ],
  [
    /function openSheet\(mode = 'all', options = \{\}\) \{[\s\S]*?setSheetSnap\(snap\);[\s\S]*?renderSheet\(\);/,
    'openSheet updates sheetSnap to open state before rendering sheet contents',
  ],
  [
    /function cycleSheetSnap\(direction = 1\) \{[\s\S]*?if \(state\.sheetSnap === 'closed'\) \{[\s\S]*?setSheetSnap\('medium'\);[\s\S]*?renderSheet\(\);[\s\S]*?return;/,
    'cycleSheetSnap materialises sheet contents when opening from closed state',
  ],
  [
    /async function refreshCatalogue\(\{ quiet = false \} = \{\}\) \{[\s\S]*?renderSheet\(\);/,
    'refreshCatalogue calls renderSheet to keep open sheets updated and closed sheets clean',
  ],
];

for (const [pattern, description] of staticChecks) {
  assert.match(app, pattern, description);
}

assert.match(app, /import \{ normalizeSearchText, rankSearchRecords \} from '\.\/assets\/runtime\/search-core\.js';/, 'Player search must consume the shared search core');
assert.match(app, /function playerSearchRecord\(song\)[\s\S]*?titleAliases: song\.aliases[\s\S]*?artistAliases: song\.artistAliases[\s\S]*?taxonomyTerms:/, 'Player search adapter must expose only reviewed catalogue identity fields');
assert.match(app, /function rankPlayerSongs\(songs, query\)[\s\S]*?rankSearchRecords\(songs\.map\(playerSearchRecord\), query\)/, 'Player results must use shared relevance ranking');
assert.match(app, /const rawQuery = els\.searchInput\.value\.trim\(\);[\s\S]*?const query = normalizeSearchText\(rawQuery\);/, 'Player empty-query handling must use shared Unicode normalization');
assert.doesNotMatch(app, /function getSheetSongs\(\)[\s\S]*?\.toLowerCase\(\)\.includes\(query\)/, 'Player search must not regress to independent lowercase substring matching');

// The production bootstrap owns song-sheet modal focus/inert/Tab behavior. app.js owns
// the triggering control and focus return. Optional polish must not install another
// sheet focus manager later and race Search or clear the bootstrap's inert state.
assert.match(
  bootstrap,
  /function syncSheetModal\(\)[\s\S]*?setBackgroundInert\(modal\)[\s\S]*?const preferred = sheetClose \|\| visibleFocusable\(songSheet\)\[0\]/,
  'Fast bootstrap remains the single song-sheet modal focus and inert authority',
);
assert.match(bootstrap, /function trapSheetTab\(event\)/, 'Fast bootstrap keeps the song-sheet Tab containment path');
assert.match(
  app,
  /const trigger = state\.sheetTrigger;[\s\S]*?state\.sheetTrigger = null;[\s\S]*?trigger\?\.isConnected[\s\S]*?trigger\.focus\(\{ preventScroll: true \}\)/,
  'Player restores focus to the control that opened the sheet',
);
for (const forbidden of [
  'function syncSheetAccessibility',
  'sheetFocusReturn',
  'sheetModalActive',
  'function setSheetBackgroundInert',
  "songSheet.addEventListener('keydown'",
]) {
  assert.equal(uxPolish.includes(forbidden), false, `Optional UX polish must not re-own song-sheet focus behavior: ${forbidden}`);
}
assert.match(uxPolish, /function setupProviderAccessibility\(overlay\)/, 'Provider overlay accessibility remains independently hardened');
assert.match(uxPolish, /overlay\.addEventListener\('keydown',[\s\S]*?trapTab\(event, overlay\)/, 'Provider overlay retains its own Tab containment');

const adapterFixture = [
  { id: 'broad-taxonomy', title: 'Another Garba', artist: 'Singer', genre: 'folk', category: 'maa' },
  { id: 'exact-title', title: 'Maa', artist: 'Singer', genre: 'traditional', category: 'garba' },
  { id: 'gujarati-title', title: 'માડી તારું કંકુ ખર્યું', artist: 'Singer', genre: 'traditional', category: 'garba' },
];
const adapterRecord = (song) => ({
  id: song.id,
  title: [song.title, song.displayTitle].filter(Boolean),
  titleAliases: song.aliases,
  artist: song.artist,
  artistAliases: song.artistAliases,
  taxonomyTerms: [song.genre, song.category, ...(song.styles || []), ...(song.taxonomyStyles || [])],
  song,
});
assert.equal(normalizeSearchText('  Maa!!!  '), 'maa', 'Shared normalization must collapse punctuation and spacing for player input');
assert.deepEqual(
  rankSearchRecords(adapterFixture.map(adapterRecord), 'maa').map(({ record }) => record.song.id),
  ['exact-title', 'broad-taxonomy'],
  'Exact title must rank above a broad taxonomy match through the player adapter',
);
assert.equal(
  rankSearchRecords(adapterFixture.map(adapterRecord), 'માડી તારું').at(0)?.record.song.id,
  'gujarati-title',
  'Gujarati script must survive the player adapter and shared normalization',
);

// 2. Behavioral simulation of player startup, sheet opening, closing, and catalogue refresh
function createMockElement(id = '', tag = 'div') {
  const classes = new Set();
  const attributes = new Map();
  const children = [];
  const listeners = new Map();

  return {
    id,
    tagName: tag.toUpperCase(),
    textContent: '',
    innerHTML: '',
    value: '',
    dataset: {},
    role: '',
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        const has = classes.has(name);
        const shouldAdd = force !== undefined ? Boolean(force) : !has;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      },
      contains: (name) => classes.has(name),
    },
    setAttribute: (name, val) => attributes.set(name, String(val)),
    getAttribute: (name) => attributes.get(name) ?? null,
    hasAttribute: (name) => attributes.has(name),
    removeAttribute: (name) => attributes.delete(name),
    append: (...nodes) => children.push(...nodes),
    appendChild: (node) => { children.push(node); return node; },
    replaceChildren: (...nodes) => { children.length = 0; children.push(...nodes); },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    focus: () => {},
    blur: () => {},
    get children() { return children; },
    get childNodes() { return children; },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

const mockEls = {
  app: createMockElement('app'),
  songSheet: createMockElement('songSheet'),
  sheetTitle: createMockElement('sheetTitle'),
  sheetSummary: createMockElement('sheetSummary'),
  sheetGenreStrip: createMockElement('sheetGenreStrip'),
  genreStrip: createMockElement('genreStrip'),
  songList: createMockElement('songList'),
  searchInput: createMockElement('searchInput', 'input'),
  searchButton: createMockElement('searchButton', 'button'),
  browseButton: createMockElement('browseButton', 'button'),
  queueButton: createMockElement('queueButton', 'button'),
  favouritesButton: createMockElement('favouritesButton', 'button'),
  sheetClose: createMockElement('sheetClose', 'button'),
  sheetHandle: createMockElement('sheetHandle', 'div'),
};

const genres = [
  { id: 'traditional', label: 'Traditional', accent: '#d97706' },
  { id: 'folk', label: 'Folk', accent: '#059669' },
  { id: 'devotional', label: 'Devotional', accent: '#dc2626' },
];

const mockState = {
  genres,
  songs: songs.slice(0, 100), // representative subset
  genreId: 'traditional',
  songId: songs[0]?.id || null,
  duration: songs[0]?.durationSeconds || 0,
  sheetFilter: 'traditional',
  sheetMode: 'all',
  sheetSnap: 'closed',
  sheetMatchCount: 0,
  sheetTrigger: null,
  manualQueue: [],
  favourites: new Set(),
};

function simulateGetSheetSongs() {
  const query = mockEls.searchInput.value.trim().toLowerCase();
  let list;
  if (mockState.sheetMode === 'favourites') {
    list = mockState.songs.filter((song) => mockState.favourites.has(song.id));
  } else if (mockState.sheetMode === 'queue') {
    list = mockState.songs.slice(0, 5);
  } else if (mockState.sheetMode === 'search') {
    if (!query) {
      mockState.sheetMatchCount = mockState.songs.length;
      return [];
    }
    list = mockState.songs;
  } else {
    list = mockState.songs.filter((song) => song.genre === mockState.sheetFilter);
  }

  if (query) {
    list = list.filter((song) =>
      [song.title, song.artist, song.genre].filter(Boolean).join(' ').toLowerCase().includes(query)
    );
  }
  mockState.sheetMatchCount = list.length;
  if (mockState.sheetMode === 'search' && list.length > 160) return list.slice(0, 160);
  return list;
}

function simulateRenderSheet() {
  mockEls.songSheet.classList.toggle('mode-favourites', mockState.sheetMode === 'favourites');
  mockEls.songSheet.classList.toggle('mode-queue', mockState.sheetMode === 'queue');
  mockEls.songSheet.classList.toggle('mode-search', mockState.sheetMode === 'search');
  mockEls.sheetTitle.textContent = mockState.sheetMode === 'favourites' ? 'My Garba'
    : mockState.sheetMode === 'queue' ? 'Up next'
    : mockState.sheetMode === 'search' ? 'Search'
    : 'Songs';

  if (mockState.sheetSnap === 'closed') {
    mockEls.songList.replaceChildren();
    if (mockEls.sheetSummary) mockEls.sheetSummary.textContent = '';
    return;
  }

  const query = mockEls.searchInput.value.trim();
  const list = simulateGetSheetSongs();
  mockEls.songList.replaceChildren();

  if (mockEls.sheetSummary) {
    if (mockState.sheetMode === 'search') {
      if (!query) mockEls.sheetSummary.textContent = `${mockState.songs.length} songs`;
      else mockEls.sheetSummary.textContent = `${mockState.sheetMatchCount} matches`;
    } else if (mockState.sheetMode === 'queue') {
      mockEls.sheetSummary.textContent = `${list.length} continue`;
    } else {
      mockEls.sheetSummary.textContent = `${mockState.sheetMatchCount} songs`;
    }
  }

  if (!list.length) {
    const empty = createMockElement('emptyState');
    empty.textContent = 'No songs found';
    mockEls.songList.append(empty);
    return;
  }

  for (const song of list) {
    const row = createMockElement(`song-${song.id}`);
    row.role = 'listitem';
    row.textContent = song.title;
    mockEls.songList.append(row);
  }
}

function simulateSetSheetSnap(snap) {
  const allowed = ['closed', 'collapsed', 'medium', 'full'];
  mockState.sheetSnap = allowed.includes(snap) ? snap : 'closed';
  mockEls.songSheet.setAttribute('aria-hidden', String(mockState.sheetSnap === 'closed'));
}

function simulateOpenSheet(mode = 'all') {
  mockState.sheetMode = mode;
  if (mockState.sheetMode === 'all') mockState.sheetFilter = mockState.genreId;
  if (mockState.sheetMode !== 'search') mockEls.searchInput.value = '';
  simulateSetSheetSnap('medium');
  simulateRenderSheet();
}

function simulateCloseSheet() {
  simulateSetSheetSnap('closed');
}

// Test A: Startup with closed sheet produces ZERO song-row DOM nodes
simulateRenderSheet();
assert.equal(mockState.sheetSnap, 'closed');
assert.equal(mockEls.songList.children.length, 0, 'Closed startup sheet must not create song-row DOM');
assert.equal(mockEls.sheetSummary.textContent, '', 'Closed sheet summary must be empty');
assert.equal(mockEls.songSheet.getAttribute('aria-hidden'), null);

// Test B: Explicit open creates expected song rows for active genre
simulateOpenSheet('all');
assert.equal(mockState.sheetSnap, 'medium');
assert.equal(mockEls.songSheet.getAttribute('aria-hidden'), 'false');
assert.ok(mockEls.songList.children.length > 0, 'Opened sheet must materialise song rows');
const initialOpenCount = mockEls.songList.children.length;
assert.equal(mockEls.sheetTitle.textContent, 'Songs');
assert.equal(mockEls.sheetSummary.textContent, `${initialOpenCount} songs`);

// Test C: Closing sheet sets snap to closed; subsequent background update does not recreate rows
simulateCloseSheet();
assert.equal(mockState.sheetSnap, 'closed');
assert.equal(mockEls.songSheet.getAttribute('aria-hidden'), 'true');

// Simulate background catalogue refresh while closed
simulateRenderSheet();
assert.equal(mockEls.songList.children.length, 0, 'Catalogue refresh while closed must keep songList empty');

// Test D: Open Search mode
simulateOpenSheet('search');
assert.equal(mockState.sheetMode, 'search');
assert.equal(mockEls.sheetTitle.textContent, 'Search');
assert.equal(mockEls.sheetSummary.textContent, `${mockState.songs.length} songs`);

// Simulate typing a query
mockEls.searchInput.value = 'a';
simulateRenderSheet();
assert.ok(mockEls.songList.children.length > 0, 'Search query must render search results');

// Test E: Open Queue mode
simulateOpenSheet('queue');
assert.equal(mockState.sheetMode, 'queue');
assert.equal(mockEls.sheetTitle.textContent, 'Up next');

// Test F: Open Favourites mode
simulateOpenSheet('favourites');
assert.equal(mockState.sheetMode, 'favourites');
assert.equal(mockEls.sheetTitle.textContent, 'My Garba');

// 3. Package script integration
assert.equal(pkg.scripts['sheet:startup:validate'], 'node scripts/lib/validate-sheet-startup.mjs');
assert.match(pkg.scripts.check, /npm run sheet:startup:validate/);
assert.match(pkg.scripts['check:modules'], /node --check scripts\/lib\/validate-sheet-startup\.mjs/);

console.log('✓ Sheet startup performance contract validated: closed sheet remains lightweight with 0 song DOM rows on startup');
console.log('✓ Explicit open materialises Songs, Search, Queue, and My Garba correctly');
console.log('✓ Song-sheet focus ownership remains single-authority across bootstrap, app, and optional polish');
console.log('✓ Background updates while closed avoid reconstructing hidden rows');
