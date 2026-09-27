import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../../src/navigation/share-context-policy.js');
const { serializeShareContext, parseShareContext } = policy;

const authority = {
  songs: [
    { id: 'song-a', genre: 'traditional', releaseId: 'release-a', durationSeconds: 240, seekable: true },
    { id: 'song-b', genre: 'dandiya', releaseIds: ['release-b', 'release-b-deluxe'], durationSeconds: 3600, seekable: false },
  ],
  sets: [
    {
      id: 'set-a', sourceId: 'yt-master-a', durationSeconds: 7200, seekable: true,
      chapters: [
        { id: 'chapter-1', startSeconds: 0, sourceId: 'yt-master-a' },
        { id: 'chapter-2', startSeconds: 3661, sourceId: 'yt-master-a' },
      ],
    },
  ],
  songAliases: { 'retired-song-a': 'song-a' },
  setAliases: { 'retired-set-a': 'set-a' },
};

function params(url) {
  return new URL(url).searchParams;
}

const song = serializeShareContext({
  baseUrl: 'https://playgarba.com/?queue=abc&history=xyz&browse=1&source=internal&utm_source=test#private',
  canonicalOrigin: 'https://playgarba.com',
  playerPath: '/',
  context: { songId: 'song-a' },
  authority,
});
assert.equal(song.valid, true);
assert.equal(song.context.kind, 'song');
assert.equal(song.context.songId, 'song-a');
assert.equal(song.context.genre, 'traditional');
assert.equal(song.url, 'https://playgarba.com/?song=song-a&genre=traditional');
assert.equal(params(song.url).has('queue'), false);
assert.equal(params(song.url).has('history'), false);
assert.equal(params(song.url).has('browse'), false);
assert.equal(params(song.url).has('source'), false);
assert.equal(params(song.url).has('utm_source'), false);
assert.equal(params(song.url).has('autoplay'), false);
assert.equal(new URL(song.url).hash, '');

const songReleaseStart = serializeShareContext({
  baseUrl: 'https://playgarba.com/',
  context: { songId: 'song-a', releaseId: 'release-a', startSeconds: 65 },
  authority,
});
assert.equal(songReleaseStart.valid, true);
assert.equal(songReleaseStart.context.releaseId, 'release-a');
assert.equal(songReleaseStart.context.startSeconds, 65);
assert.equal(songReleaseStart.url, 'https://playgarba.com/?song=song-a&genre=traditional&release=release-a&t=65');

const startZero = serializeShareContext({ baseUrl: 'https://playgarba.com/', context: { songId: 'song-a', startSeconds: 0 }, authority });
assert.equal(startZero.context.startSeconds, 0);
assert.equal(params(startZero.url).get('t'), '0');

const mismatchRelease = serializeShareContext({
  baseUrl: 'https://playgarba.com/', context: { songId: 'song-a', releaseId: 'release-b' }, authority,
});
assert.equal(mismatchRelease.valid, true);
assert.equal(mismatchRelease.context.songId, 'song-a');
assert.equal(mismatchRelease.context.releaseId, null);
assert(mismatchRelease.issues.includes('release-mismatch'));
assert.equal(params(mismatchRelease.url).has('release'), false);

const aliasSong = serializeShareContext({ baseUrl: 'https://playgarba.com/', context: { songId: 'retired-song-a' }, authority });
assert.equal(aliasSong.context.songId, 'song-a');
assert(aliasSong.issues.includes('song-alias-resolved'));
assert.equal(params(aliasSong.url).get('song'), 'song-a');

const set = serializeShareContext({
  baseUrl: 'https://playgarba.com/?favourites=1&preferences=compact',
  context: { nonstopSetId: 'set-a', chapterId: 'chapter-2', startSeconds: 3661 },
  authority,
});
assert.equal(set.valid, true);
assert.equal(set.context.kind, 'nonstop');
assert.equal(set.context.nonstopSetId, 'set-a');
assert.equal(set.context.chapterId, 'chapter-2');
assert.equal(set.context.startSeconds, 3661);
assert.equal(set.url, 'https://playgarba.com/?nonstop=set-a&chapter=chapter-2&t=3661');

const aliasSet = serializeShareContext({ baseUrl: 'https://playgarba.com/', context: { setId: 'retired-set-a' }, authority });
assert.equal(aliasSet.context.nonstopSetId, 'set-a');
assert(aliasSet.issues.includes('set-alias-resolved'));

const badChapter = serializeShareContext({
  baseUrl: 'https://playgarba.com/', context: { nonstopSetId: 'set-a', chapterId: 'chapter-other' }, authority,
});
assert.equal(badChapter.valid, true);
assert.equal(badChapter.context.chapterId, null);
assert(badChapter.issues.includes('chapter-unverified'));

const songChapter = serializeShareContext({
  baseUrl: 'https://playgarba.com/', context: { songId: 'song-a', chapterId: 'chapter-1' }, authority,
});
assert.equal(songChapter.context.songId, 'song-a');
assert.equal(songChapter.context.chapterId, null);
assert(songChapter.issues.includes('chapter-incompatible'));

for (const badStart of [-1, Number.NaN, Number.POSITIVE_INFINITY, 241]) {
  const out = serializeShareContext({ baseUrl: 'https://playgarba.com/', context: { songId: 'song-a', startSeconds: badStart }, authority });
  assert.equal(out.valid, true);
  assert.equal(out.context.songId, 'song-a');
  assert.equal(out.context.startSeconds, null);
  assert.equal(params(out.url).has('t'), false);
  assert(out.issues.some((issue) => issue.startsWith('start-')));
}

const nonSeekable = serializeShareContext({
  baseUrl: 'https://playgarba.com/', context: { songId: 'song-b', startSeconds: 20 }, authority,
});
assert.equal(nonSeekable.context.startSeconds, null);
assert(nonSeekable.issues.includes('start-not-seekable'));

const conflict = serializeShareContext({
  baseUrl: 'https://playgarba.com/', context: { songId: 'song-a', nonstopSetId: 'set-a' }, authority,
});
assert.equal(conflict.valid, false);
assert.equal(conflict.reason, 'identity-conflict');

const unknown = serializeShareContext({ baseUrl: 'https://playgarba.com/', context: { songId: 'Song A' }, authority });
assert.equal(unknown.valid, false);
assert.equal(unknown.reason, 'identity-invalid');

const serializeGenreMismatch = serializeShareContext({
  baseUrl: 'https://playgarba.com/', context: { songId: 'song-a', genre: 'fusion' }, authority,
});
assert.equal(serializeGenreMismatch.context.genre, 'traditional');
assert(serializeGenreMismatch.issues.includes('genre-mismatch'));

const duplicateParam = parseShareContext({
  url: 'https://playgarba.com/?song=song-a&song=song-b', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(duplicateParam.valid, false);
assert.equal(duplicateParam.reason, 'parameter-duplicate');

const parsedSong = parseShareContext({
  url: 'https://playgarba.com/?song=song-a&genre=fusion&release=release-a&t=60&queue=q&history=h&autoplay=1&utm_medium=social#frag',
  canonicalOrigin: 'https://playgarba.com', playerPath: '/', authority,
});
assert.equal(parsedSong.valid, true);
assert.deepEqual(parsedSong.context, {
  kind: 'song', songId: 'song-a', nonstopSetId: null, genre: 'traditional', releaseId: 'release-a', startSeconds: 60, chapterId: null,
});
assert(parsedSong.issues.includes('genre-mismatch'));
assert(parsedSong.issues.includes('transient-param-ignored'));
assert(parsedSong.issues.includes('fragment-ignored'));
assert.equal(Object.prototype.hasOwnProperty.call(parsedSong.context, 'autoplay'), false);

const parsedAlias = parseShareContext({
  url: 'https://playgarba.com/?song=retired-song-a&t=1', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(parsedAlias.valid, true);
assert.equal(parsedAlias.context.songId, 'song-a');
assert(parsedAlias.issues.includes('song-alias-resolved'));

const parsedMismatchRelease = parseShareContext({
  url: 'https://playgarba.com/?song=song-a&release=release-b', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(parsedMismatchRelease.valid, true);
assert.equal(parsedMismatchRelease.context.songId, 'song-a');
assert.equal(parsedMismatchRelease.context.releaseId, null);
assert(parsedMismatchRelease.issues.includes('release-mismatch'));

for (const t of ['-1', '1.5', 'NaN', 'Infinity', '999']) {
  const parsedBadTime = parseShareContext({
    url: `https://playgarba.com/?song=song-a&t=${encodeURIComponent(t)}`,
    canonicalOrigin: 'https://playgarba.com', authority,
  });
  assert.equal(parsedBadTime.valid, true);
  assert.equal(parsedBadTime.context.songId, 'song-a');
  assert.equal(parsedBadTime.context.startSeconds, null);
  assert(parsedBadTime.issues.some((issue) => issue.startsWith('start-')));
}

const parsedNonSeekable = parseShareContext({
  url: 'https://playgarba.com/?song=song-b&t=42', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(parsedNonSeekable.context.startSeconds, null);
assert(parsedNonSeekable.issues.includes('start-not-seekable'));

const parsedSet = parseShareContext({
  url: 'https://playgarba.com/?nonstop=set-a&chapter=chapter-2&t=3661', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(parsedSet.valid, true);
assert.equal(parsedSet.context.nonstopSetId, 'set-a');
assert.equal(parsedSet.context.chapterId, 'chapter-2');
assert.equal(parsedSet.context.startSeconds, 3661);

const parsedWrongChapter = parseShareContext({
  url: 'https://playgarba.com/?nonstop=set-a&chapter=other', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(parsedWrongChapter.valid, true);
assert.equal(parsedWrongChapter.context.nonstopSetId, 'set-a');
assert.equal(parsedWrongChapter.context.chapterId, null);
assert(parsedWrongChapter.issues.includes('chapter-unverified'));

const parsedConflict = parseShareContext({
  url: 'https://playgarba.com/?song=song-a&nonstop=set-a', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(parsedConflict.valid, false);
assert.equal(parsedConflict.reason, 'identity-conflict');

const crossOrigin = parseShareContext({
  url: 'https://evil.example/?song=song-a', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(crossOrigin.valid, false);
assert.equal(crossOrigin.reason, 'origin-mismatch');

const wrongPath = parseShareContext({
  url: 'https://playgarba.com/explore/?song=song-a', canonicalOrigin: 'https://playgarba.com', playerPath: '/', authority,
});
assert.equal(wrongPath.valid, false);
assert.equal(wrongPath.reason, 'path-mismatch');

const unknownParsed = parseShareContext({
  url: 'https://playgarba.com/?song=unknown-song', canonicalOrigin: 'https://playgarba.com', authority,
});
assert.equal(unknownParsed.valid, false);
assert.equal(unknownParsed.reason, 'identity-unknown');

const authorityBefore = structuredClone(authority);
const contextInput = { songId: 'song-a', releaseId: 'release-a', startSeconds: 120 };
const contextBefore = structuredClone(contextInput);
const immutable = serializeShareContext({ baseUrl: 'https://playgarba.com/', context: contextInput, authority });
assert.deepEqual(authority, authorityBefore);
assert.deepEqual(contextInput, contextBefore);
assert(Object.isFrozen(immutable));
assert(Object.isFrozen(immutable.context));
assert(Object.isFrozen(immutable.issues));

const parseImmutable = parseShareContext({ url: immutable.url, canonicalOrigin: 'https://playgarba.com', authority });
assert(Object.isFrozen(parseImmutable));
assert(Object.isFrozen(parseImmutable.context));
assert(Object.isFrozen(parseImmutable.issues));

const badAliasAuthority = { ...authority, songAliases: { old: 'missing-song' } };
assert.equal(serializeShareContext({ baseUrl: 'https://playgarba.com/', context: { songId: 'song-a' }, authority: badAliasAuthority }).valid, false);

assert.equal(params(songReleaseStart.url).has('autoplay'), false);
assert.equal(params(set.url).has('autoplay'), false);

console.log('share context policy: ok');
