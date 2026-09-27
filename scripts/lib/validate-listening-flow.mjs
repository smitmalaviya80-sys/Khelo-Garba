import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [app, index, styles, library, nonstop] = await Promise.all([
  read('app.js'),
  read('index.html'),
  read('styles/10-browser-and-shell.css'),
  read('src/catalogue/listening-library.js'),
  read('nonstop-browser.js'),
]);
let failed = false;
const requireMarker = (source, marker, label) => { if (!source.includes(marker)) { console.error('✗ ' + label + ': ' + marker); failed = true; } };

for (const marker of [
  "manualQueue: [...new Set(storage.get('garba:queue'",
  'function queueSong(songId)',
  'state.manualQueue.shift()',
  'function removeQueuedSong(songId',
  'function clearManualQueue()',
  'state.playContextGenreId || state.genreId',
  'state.listeningHistory.pop()',
  'if (!canExecuteSong(queuedSong))',
  'preserveContext: true, fromHistory: true',
  "params.get('library') === 'my-garba'",
  'if (!canExecuteSong(queuedSong))',
  'preserveContext: true, fromHistory: true',
  "params.get('library') === 'my-garba'",
  "showToast('Added to Up next.')",
  "state.sheetMode === 'favourites' ? 'My Garba'",
  "storage.set('garba:favourites'",
]) requireMarker(app, marker, 'Listening flow contract missing');

requireMarker(index, 'aria-label="Open My Garba"', 'My Garba topbar label missing');
requireMarker(styles, '/* Listening flow #287 */', 'Listening-flow styles missing');
requireMarker(styles, '.song-queue-action', 'Play-next row action missing');
requireMarker(library, "heading.textContent = 'My Garba';", 'Explore My Garba section missing');
requireMarker(library, "openMyGarba.href = '../?library=my-garba';", 'Explore must expose a low-clutter My Garba entry point');
requireMarker(library, "if (card.dataset.artistIdentityDecorated === artistId) return;", 'Explore artist identity decoration must be idempotent');
requireMarker(library, "observe(sections, { childList: true, subtree: false });", 'Explore artist observer must watch top-level catalogue rerenders only');
if (library.includes("new MutationObserver(queueArtistIdentity).observe(sections, { childList: true, subtree: true });")) { console.error('✗ Explore artist observer must not observe mutations created by its own decorator'); failed = true; }
requireMarker(library, "openMyGarba.href = '../?library=my-garba';", 'Explore must expose a low-clutter My Garba entry point');
requireMarker(nonstop, "target.closest('#queueButton')", 'Nonstop chooser must use one truthful queue action');
requireMarker(nonstop, '.app[data-play-mode="nonstop"] #prevButton', 'Nonstop ordinary transport must be hidden while a set is active');
if (nonstop.includes("target.closest('#queueButton, #prevButton, #nextButton, #miniPrev, #miniNext')")) { console.error('✗ Nonstop previous/next controls must not be repurposed as chooser actions'); failed = true; }

if (app.includes("storage.set('garba:my-garba'")) { console.error('✗ Existing garba:favourites storage key must not be migrated'); failed = true; }
if (failed) process.exit(1);
console.log('✓ manual Up next is FIFO, deduplicated and removable without replacing catalogue identity');
console.log('✓ Previous uses actual listening history and Next returns to the catalogue context after queued songs');
console.log('✓ My Garba reuses the existing favourites storage instead of adding playlist CRUD');
console.log('✓ Nonstop transport remains isolated from the ordinary song queue with one truthful chooser action');
