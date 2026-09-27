import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = path.join(repoRoot, 'src/accessibility/overlay-interaction-policy.js');
const { buildOverlayInteractionPolicy } = require(policyPath);

function sheet(mode = 'browse', overrides = {}) {
  return {
    id: 'songSheet',
    kind: 'song-sheet',
    mode,
    open: true,
    modal: false,
    dismissible: true,
    ownsHistory: true,
    openerId: mode === 'search' ? 'searchButton' : mode === 'queue' ? 'queueButton' : mode === 'favourites' ? 'favouritesButton' : 'browseButton',
    ...overrides,
  };
}

function nonstop(overrides = {}) {
  return {
    id: 'nonstopBrowser',
    kind: 'nonstop-browser',
    open: true,
    modal: true,
    dismissible: true,
    ownsHistory: false,
    openerId: 'nonstopButton',
    ...overrides,
  };
}

function keyboard(key, overrides = {}) {
  return { type: 'keyboard', key, code: key === ' ' ? 'Space' : key, ...overrides };
}

for (const mode of ['browse', 'search', 'queue', 'favourites']) {
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet(mode)] });
  assert.equal(result.valid, true, mode);
  assert.equal(result.topmostSurfaceId, 'songSheet', mode);
  assert.equal(result.topmostModalId, null, mode);
  assert.equal(result.backgroundInert, false, mode);
  assert.equal(result.focusContainment, null, mode);
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet('search'), nonstop()] });
  assert.equal(result.topmostSurfaceId, 'nonstopBrowser');
  assert.equal(result.topmostModalId, 'nonstopBrowser');
  assert.equal(result.backgroundInert, true);
  assert.deepEqual(result.focusContainment, { surfaceId: 'nonstopBrowser', mode: 'contain' });
}

for (const shiftKey of [false, true]) {
  const result = buildOverlayInteractionPolicy({
    surfaces: [sheet('queue'), nonstop()],
    event: keyboard('Tab', { code: 'Tab', shiftKey }),
  });
  assert.equal(result.intent.id, 'contain-focus');
  assert.equal(result.intent.owner, 'nonstopBrowser');
  assert.equal(result.intent.direction, shiftKey ? 'backward' : 'forward');
  assert.equal(result.suppressGlobalShortcuts, true);
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet('search')], event: keyboard('Tab', { code: 'Tab' }) });
  assert.equal(result.intent, null);
  assert.equal(result.focusContainment, null);
  assert.equal(result.backgroundInert, false);
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet('search'), nonstop()], event: keyboard('Escape', { code: 'Escape' }) });
  assert.deepEqual(result.intent, { id: 'dismiss-surface', owner: 'nonstopBrowser', via: 'escape' });
  assert.equal(result.restoreFocusTo, 'nonstopButton');
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet('queue')], event: keyboard('Escape', { code: 'Escape' }) });
  assert.deepEqual(result.intent, { id: 'dismiss-surface', owner: 'songSheet', via: 'escape' });
  assert.equal(result.restoreFocusTo, 'queueButton');
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet('favourites')], event: { type: 'history-back' } });
  assert.deepEqual(result.intent, { id: 'dismiss-surface', owner: 'songSheet', via: 'history-back' });
  assert.equal(result.restoreFocusTo, 'favouritesButton');
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet('browse'), nonstop()], event: { type: 'history-back' } });
  assert.equal(result.intent, null, 'history must not dismiss an underlying sheet through a topmost surface that does not own history');
}

{
  const result = buildOverlayInteractionPolicy({
    surfaces: [sheet('search'), nonstop({ dismissible: false })],
    event: keyboard('Escape', { code: 'Escape' }),
  });
  assert.equal(result.intent, null, 'Escape must not dismiss an underlying surface through a non-dismissible topmost modal');
  assert.equal(result.suppressGlobalShortcuts, true);
}

for (const target of [
  { tagName: 'input' },
  { tagName: 'textarea' },
  { tagName: 'select' },
  { tagName: 'button' },
  { tagName: 'a' },
  { role: 'slider' },
  { role: 'textbox' },
  { contentEditable: true },
  { editable: true },
  { tagName: 'input', role: 'slider' },
]) {
  const result = buildOverlayInteractionPolicy({
    surfaces: [],
    event: keyboard(' ', { code: 'Space', target }),
  });
  assert.equal(result.suppressGlobalShortcuts, true, JSON.stringify(target));
  assert.equal(result.intent.id, 'suppress-global-shortcut', JSON.stringify(target));
}

{
  const result = buildOverlayInteractionPolicy({
    surfaces: [sheet('browse')],
    event: keyboard(' ', { code: 'Space', target: { overlayId: 'songSheet', tagName: 'div' } }),
  });
  assert.equal(result.intent.id, 'suppress-global-shortcut');
  assert.equal(result.intent.owner, 'songSheet');
}

for (const fixture of [
  [keyboard(' ', { code: 'Space' }), 'global-playback-toggle'],
  [keyboard('ArrowLeft', { code: 'ArrowLeft' }), 'global-seek-backward'],
  [keyboard('ArrowRight', { code: 'ArrowRight' }), 'global-seek-forward'],
  [keyboard('/', { code: 'Slash' }), 'global-search'],
  [keyboard('f', { code: 'KeyF' }), 'global-favourite'],
]) {
  const [event, expected] = fixture;
  const result = buildOverlayInteractionPolicy({ surfaces: [], event });
  assert.equal(result.suppressGlobalShortcuts, false, expected);
  assert.deepEqual(result.intent, { id: expected, owner: 'player-global' }, expected);
}

for (const event of [
  keyboard(' ', { code: 'Space', altKey: true }),
  keyboard('f', { code: 'KeyF', metaKey: true }),
  keyboard('/', { code: 'Slash', ctrlKey: true }),
]) {
  const result = buildOverlayInteractionPolicy({ surfaces: [], event });
  assert.equal(result.intent, null);
  assert.equal(result.event.modified, true);
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [], event: keyboard(' ', { code: 'Space', repeat: true }) });
  assert.equal(result.intent.id, 'global-playback-toggle');
  assert.equal(result.event.repeat, true, 'repeat is surfaced rather than silently reinterpreted');
}

{
  const result = buildOverlayInteractionPolicy({
    surfaces: [nonstop()],
    event: keyboard(' ', { code: 'Space', target: { tagName: 'div' } }),
  });
  assert.equal(result.intent.id, 'suppress-global-shortcut');
  assert.equal(result.intent.owner, 'nonstopBrowser');
}

for (const mode of ['', 'garba', 'favorites', 'songs']) {
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet(mode)] });
  assert.equal(result.valid, false, mode);
  assert.equal(result.reason, 'song-sheet-mode-invalid', mode);
  assert.equal(result.suppressGlobalShortcuts, true, mode);
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet('browse', { modal: true })] });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'song-sheet-must-be-non-modal');
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [nonstop({ modal: false })] });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'nonstop-browser-must-be-modal');
}

{
  const result = buildOverlayInteractionPolicy({ surfaces: [sheet(), { ...nonstop(), id: 'songSheet' }] });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'duplicate-surface-id');
  assert.equal(result.intent, null);
}

for (const surfaces of [null, {}, 'invalid']) {
  const result = buildOverlayInteractionPolicy({ surfaces });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'surface-stack-invalid');
}

for (const malformed of [{}, { id: 'x' }, { kind: 'custom' }]) {
  const result = buildOverlayInteractionPolicy({ surfaces: [malformed] });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'surface-invalid');
}

{
  const result = buildOverlayInteractionPolicy({
    surfaces: [{ id: 'futureDetails', kind: 'details', open: true, modal: true, dismissible: true, ownsHistory: true, openerId: 'detailsButton' }],
    event: keyboard('Escape', { code: 'Escape' }),
  });
  assert.equal(result.valid, true);
  assert.equal(result.topmostModalId, 'futureDetails');
  assert.equal(result.backgroundInert, true);
  assert.equal(result.intent.owner, 'futureDetails');
  assert.equal(result.restoreFocusTo, 'detailsButton');
}

{
  const input = {
    surfaces: [sheet('search'), nonstop()],
    event: keyboard('Tab', { code: 'Tab', shiftKey: true, target: { tagName: 'button', overlayId: 'nonstopBrowser' } }),
  };
  const before = structuredClone(input);
  const result = buildOverlayInteractionPolicy(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.focusContainment), true);
  assert.equal(Object.isFrozen(result.intent), true);
  assert.equal(Object.isFrozen(result.event), true);
  assert.equal(Object.isFrozen(result.event.target), true);
}

{
  const first = buildOverlayInteractionPolicy({ surfaces: [sheet('queue'), nonstop()], event: keyboard('Tab', { code: 'Tab' }) });
  const second = buildOverlayInteractionPolicy({ surfaces: [sheet('queue'), nonstop()], event: keyboard('Tab', { code: 'Tab' }) });
  assert.deepEqual(first, second);
}

{
  const source = await fs.readFile(policyPath, 'utf8');
  for (const forbidden of [
    'document.', 'window.', 'navigator.', 'addEventListener(', 'removeEventListener(', '.focus(',
    '.inert', 'history.', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB',
    'setTimeout(', 'setInterval(', 'preventDefault(', 'stopPropagation(', 'stopImmediatePropagation(',
  ]) {
    assert.equal(source.includes(forbidden), false, `policy must remain side-effect free: ${forbidden}`);
  }
}

console.log('Overlay interaction policy tests passed.');
