import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  parseShareTimestamp,
  buildSongShareUrl,
  buildNonstopShareUrl,
  formatShareText,
  executeShare,
} from '../../assets/runtime/share-intent.js';

const root = path.resolve(import.meta.dirname, '../..');

// 1. Pure Unit Verification for share-intent.js
// Timestamp parsing
assert.equal(parseShareTimestamp(125), 125);
assert.equal(parseShareTimestamp('125'), 125);
assert.equal(parseShareTimestamp('125s'), 125);
assert.equal(parseShareTimestamp('02:05'), 125);
assert.equal(parseShareTimestamp('1:02:05'), 3725);
assert.equal(parseShareTimestamp('00:45'), 45);

// Timestamp edge cases and bounds
assert.equal(parseShareTimestamp(null), null);
assert.equal(parseShareTimestamp(''), null);
assert.equal(parseShareTimestamp('  '), null);
assert.equal(parseShareTimestamp(0), null);
assert.equal(parseShareTimestamp(-10), null);
assert.equal(parseShareTimestamp('-5'), null);
assert.equal(parseShareTimestamp('invalid'), null);
assert.equal(parseShareTimestamp('12:xx'), null);
assert.equal(parseShareTimestamp(Number.NaN), null);
assert.equal(parseShareTimestamp(Number.POSITIVE_INFINITY), null);
// Over-duration rejection
assert.equal(parseShareTimestamp(300, 200), null, 'timestamp beyond duration must fail closed');
assert.equal(parseShareTimestamp(200, 200), null, 'timestamp at exact end must fail closed');
assert.equal(parseShareTimestamp(199, 200), 199, 'timestamp within duration must succeed');

// Song URL builder
const songUrl = buildSongShareUrl({ songId: 'song-ochhav-1', timestampSeconds: 45, origin: 'https://playgarba.com/' });
assert.equal(songUrl, 'https://playgarba.com/?song=song-ochhav-1&t=45');

const songUrlNoTime = buildSongShareUrl({ songId: 'song-ochhav-1', origin: 'https://playgarba.com/' });
assert.equal(songUrlNoTime, 'https://playgarba.com/?song=song-ochhav-1');

assert.equal(buildSongShareUrl({ songId: '' }), null);
assert.equal(buildSongShareUrl({ songId: null }), null);

// Nonstop URL builder
const nonstopUrl = buildNonstopShareUrl({ setId: 'set-hemant-2023', timestampSeconds: 120, origin: 'https://playgarba.com/' });
assert.equal(nonstopUrl, 'https://playgarba.com/?nonstop=set-hemant-2023&t=120');

const nonstopUrlNoTime = buildNonstopShareUrl({ setId: 'set-hemant-2023', origin: 'https://playgarba.com/' });
assert.equal(nonstopUrlNoTime, 'https://playgarba.com/?nonstop=set-hemant-2023');

// Text formatting
assert.equal(
  formatShareText({ title: 'Ochhav Theme', artist: 'Aditya Gadhvi', context: 'song' }),
  'Listen to "Ochhav Theme" by Aditya Gadhvi on PlayGarba'
);
assert.equal(
  formatShareText({ title: 'Ochhav Theme', artist: '', context: 'song' }),
  'Listen to "Ochhav Theme" on PlayGarba'
);
assert.equal(
  formatShareText({ title: 'Tahukar 9', context: 'nonstop' }),
  'Tahukar 9 · Nonstop Garba on PlayGarba'
);

// Execution with Web Share API success
const mockNavShare = {
  share: async (payload) => {
    assert.equal(payload.title, 'Test Title');
    assert.equal(payload.url, 'https://playgarba.com/?song=1');
  },
};
const resShared = await executeShare({
  title: 'Test Title',
  url: 'https://playgarba.com/?song=1',
  navigatorObj: mockNavShare,
});
assert.deepEqual(resShared, { status: 'shared', url: 'https://playgarba.com/?song=1' });

// Execution with Web Share API abort (user cancelled dialog)
const mockNavAbort = {
  share: async () => {
    const err = new Error('Share canceled');
    err.name = 'AbortError';
    throw err;
  },
};
const resAbort = await executeShare({
  title: 'Test Title',
  url: 'https://playgarba.com/?song=1',
  navigatorObj: mockNavAbort,
});
assert.deepEqual(resAbort, { status: 'cancelled', url: 'https://playgarba.com/?song=1' });

// Execution with clipboard fallback
let clipboardWritten = '';
const mockNavClipboard = {
  clipboard: {
    writeText: async (text) => { clipboardWritten = text; },
  },
};
const resCopied = await executeShare({
  title: 'Test Title',
  url: 'https://playgarba.com/?song=2',
  navigatorObj: mockNavClipboard,
});
assert.deepEqual(resCopied, { status: 'copied', url: 'https://playgarba.com/?song=2' });
assert.equal(clipboardWritten, 'https://playgarba.com/?song=2');

// Execution with denied clipboard
const mockNavDenied = {
  clipboard: {
    writeText: async () => { throw new Error('NotAllowedError'); },
  },
};
const resDenied = await executeShare({
  title: 'Test Title',
  url: 'https://playgarba.com/?song=3',
  navigatorObj: mockNavDenied,
});
assert.equal(resDenied.status, 'failed');
assert.equal(resDenied.reason, 'clipboard-denied');

// 2. Integration marker checks
const appSrc = await readFile(path.join(root, 'app.js'), 'utf8');
const nonstopSrc = await readFile(path.join(root, 'nonstop-browser.js'), 'utf8');

let failed = false;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failed = true;
};

// app.js markers
for (const marker of [
  "import './assets/runtime/share-intent.js';",
  "shareButton: $('shareButton'),",
  'handleShareCurrentSong',
  'buildSongShareUrl',
  'parseShareTimestamp',
  'window.GARBA_SHARE',
]) {
  if (!appSrc.includes(marker)) fail(`app.js missing required marker: "${marker}"`);
}

// nonstop-browser.js markers
for (const marker of [
  'shareActiveSet',
  'buildNonstopShareUrl',
  'share: shareActiveSet',
  'get activeSet()',
]) {
  if (!nonstopSrc.includes(marker)) fail(`nonstop-browser.js missing required marker: "${marker}"`);
}

if (failed) {
  process.exit(1);
}

console.log('✓ All share intent unit contracts and integration markers passed.');
