import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parseYouTubeLink,
  parseYouTubePlaylist,
  resolveYouTubePlaylist,
  cleanVideoTitle,
  makeUserSong,
  readMySongs,
  serializeMySongs,
  fetchVideoDetails,
  suggestionUrl,
} from '../../assets/runtime/my-songs.js';
import { createPlayableOrder, PLAYABLE_TIER } from '../../assets/runtime/playable-order.js';
import { isLivePlayable, buildLiveSchedule } from '../../assets/runtime/live-station.js';
import { isCircleEligible, mulberry32 } from '../../assets/runtime/garba-circle.js';

const root = path.resolve(import.meta.dirname, '../..');
const pass = (message) => console.log(`✓ ${message}`);

/* ---------------- YouTube links ---------------- */

const id = 'dQw4w9WgXcQ';
for (const link of [
  id,
  `https://www.youtube.com/watch?v=${id}`,
  `https://youtube.com/watch?v=${id}&list=PL123&t=42s`,
  `https://m.youtube.com/watch?v=${id}`,
  `https://music.youtube.com/watch?v=${id}&feature=share`,
  `https://youtu.be/${id}?si=abc`,
  `youtu.be/${id}`,
  `https://www.youtube.com/shorts/${id}`,
  `https://www.youtube.com/embed/${id}?start=10`,
  `https://www.youtube.com/live/${id}`,
  `  https://www.youtube.com/watch?v=${id}  `,
]) assert.equal(parseYouTubeLink(link), id, link);
for (const bad of [
  '',
  'hello',
  'https://example.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=short',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ<script>',
  'javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/channel/UC123',
]) assert.equal(parseYouTubeLink(bad), null, bad);
pass('YouTube links in every common form are read; other hosts, look-alike hosts and malformed ids are rejected');

/* ---------------- names ---------------- */

const cases = [
  ['Rang Taali | Aishwarya Majmudar | Official Video | Navratri 2023', 'Some Label', { title: 'Rang Taali', artist: 'Aishwarya Majmudar' }],
  ['Kesariyo Rang (Official Video) - Kinjal Dave', 'Kinjal Dave Official', { title: 'Kesariyo Rang', artist: 'Kinjal Dave' }],
  ['Pankhida', 'Falguni Pathak - Topic', { title: 'Pankhida', artist: 'Falguni Pathak' }],
  ['Chogada Tara [Full Song] #garba #navratri', 'Label Music', { title: 'Chogada Tara', artist: 'Label' }],
  ['Radha Ne Shyam Mali Jashe (Remix)', 'DJ Channel', { title: 'Radha Ne Shyam Mali Jashe (Remix)', artist: 'DJ' }],
  ['Official Video', '', { title: 'Official Video', artist: '' }],
];
for (const [raw, channel, expected] of cases) assert.deepEqual(cleanVideoTitle(raw, channel), expected, raw);
pass(`upload noise (Official Video, Full Song, hashtags, Topic channels) is removed from ${cases.length} sample titles, meaningful notes like (Remix) stay`);

/* ---------------- storage ---------------- */

const song = makeUserSong({ videoId: id, title: '  Rang   Taali ', artist: '', genre: 'dandiya', addedAt: 1 });
assert.equal(song.id, `mine-${id}`);
assert.equal(song.title, 'Rang Taali');
assert.equal(song.artist, 'Added by you');
assert.equal(song.playbackSourceUrl, `https://www.youtube.com/watch?v=${id}`);
assert.equal(makeUserSong({ videoId: 'bad', title: 'x' }), null);
const genres = new Set(['traditional', 'dandiya']);
const roundTrip = readMySongs(serializeMySongs([song, song]), genres);
assert.deepEqual(roundTrip, [song], 'round trip keeps one copy');
assert.deepEqual(readMySongs('not json'), []);
assert.deepEqual(readMySongs('{"a":1}'), []);
const tampered = readMySongs(JSON.stringify([
  { videoId: '"><img src=x>', title: 'x' },
  { videoId: id, title: 'y'.repeat(500), genre: 'not-a-genre' },
]), genres);
assert.equal(tampered.length, 1, 'entries with a bad video id are dropped');
assert.equal(tampered[0].genre, 'traditional', 'unknown categories fall back to Traditional');
assert.ok(tampered[0].title.length <= 140, 'long titles are cut');
pass('added songs round-trip through storage; malformed or tampered entries are dropped or made safe');

/* ---------------- added songs stay out of shared playback ---------------- */

assert.equal(isLivePlayable(song), false, 'added songs are never in 24/7 Live Radio');
assert.equal(isCircleEligible({ ...song, durationSeconds: 200 }), false, 'added songs are never in a Garba Circle');
const catalogue = JSON.parse(await readFile(path.join(root, 'data/songs.json'), 'utf8'));
assert.deepEqual(
  buildLiveSchedule([...catalogue, song]).map((entry) => entry.id),
  buildLiveSchedule(catalogue).map((entry) => entry.id),
  'the Live schedule is identical with or without added songs',
);
pass('added songs never enter Live Radio or Garba Circle, so shared playback stays identical on every device');

/* ---------------- oEmbed ---------------- */

let requested = null;
const details = await fetchVideoDetails(id, {
  fetchImpl: async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ title: 'Rang Taali | Official', author_name: 'Label' }) };
  },
});
assert.deepEqual(details, { title: 'Rang Taali | Official', channel: 'Label' });
assert.ok(requested.url.startsWith('https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D'), requested.url);
assert.equal(requested.options.credentials, 'omit');
assert.deepEqual(await fetchVideoDetails(id, { fetchImpl: async () => ({ ok: false, status: 401 }) }), { unavailable: true });
assert.equal(await fetchVideoDetails(id, { fetchImpl: async () => { throw new Error('offline'); } }), null);
assert.equal(await fetchVideoDetails('bad', { fetchImpl: async () => { throw new Error('should not fetch'); } }), null);
pass('names come from YouTube oEmbed without cookies; failures fall back to typing the name');

const suggestion = new URL(suggestionUrl({ ...song, artist: 'Aishwarya Majmudar' }, 'Dandiya Raas'));
assert.equal(suggestion.origin + suggestion.pathname, 'https://github.com/ruddvz/garba/issues/new');
assert.equal(suggestion.searchParams.get('template'), 'missing-song.yml');
assert.equal(suggestion.searchParams.get('title'), '[Missing music] Rang Taali — Aishwarya Majmudar');
assert.equal(suggestion.searchParams.get('source'), `https://www.youtube.com/watch?v=${id}`);
pass('"Suggest for PlayGarba" opens a prefilled Missing music issue for review');

/* ---------------- playable-first ordering ---------------- */

// The player's own route rules (a browser script that registers on window).
globalThis.window = globalThis;
await import('../../assets/runtime/route-readiness.js');
const { canExecuteSong, youtubeVideoId } = globalThis.GARBA_ROUTE_READINESS;
delete globalThis.window;
const routes = { canExecute: canExecuteSong, videoIdOf: youtubeVideoId };
const order = createPlayableOrder(catalogue, routes);
const tiers = catalogue.map(order.tier);
const count = (tier) => tiers.filter((value) => value === tier).length;
assert.ok(count(PLAYABLE_TIER.FULL) > 100 && count(PLAYABLE_TIER.CHAPTER) > 100 && count(PLAYABLE_TIER.UNAVAILABLE) > 100);
const traditional = catalogue.filter((entry) => entry.genre === 'traditional');
const ordered = order.order(traditional);
assert.equal(ordered.length, traditional.length, 'nothing is dropped');
for (let i = 1; i < ordered.length; i += 1) assert.ok(order.tier(ordered[i - 1]) <= order.tier(ordered[i]), 'tiers never go backwards');
const fullInSource = traditional.filter((entry) => order.tier(entry) === PLAYABLE_TIER.FULL).map((entry) => entry.id);
assert.deepEqual(ordered.slice(0, fullInSource.length).map((entry) => entry.id), fullInSource, 'order inside a tier is kept');
const random = mulberry32(7);
const picks = new Set();
for (let i = 0; i < 60; i += 1) {
  const pick = order.pickFresh(traditional, { random });
  assert.equal(order.tier(pick), PLAYABLE_TIER.FULL, 'a genre tap starts a complete song');
  picks.add(pick.id);
}
assert.ok(picks.size >= Math.min(20, fullInSource.length / 2), `picks vary (${picks.size} distinct of ${fullInSource.length})`);
const recent = fullInSource.slice(0, fullInSource.length - 1);
assert.equal(order.pickFresh(traditional, { recentIds: recent, random: () => 0 }).id, fullInSource.at(-1), 'recently heard songs are skipped');
assert.equal(order.pickFresh(catalogue.filter((entry) => !entry.youtubeId && !entry.audioUrl)), null, 'a pool with nothing playable returns null');
pass(`playable-first ordering: ${count(PLAYABLE_TIER.FULL)} complete songs, then ${count(PLAYABLE_TIER.CHAPTER)} chapters, then ${count(PLAYABLE_TIER.UNAVAILABLE)} not playable yet; genre taps start a fresh complete song`);

/* ---------------- YouTube playlists ---------------- */

const list = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
assert.equal(parseYouTubePlaylist(`https://www.youtube.com/playlist?list=${list}`), list);
assert.equal(parseYouTubePlaylist(`youtube.com/watch?v=${id}&list=${list}&index=2`), list);
assert.equal(parseYouTubePlaylist(`https://music.youtube.com/playlist?list=OLAK5uy_kXq8wHn3T6BAu4B7ZUGsT3Uum0lZ7FjRM`), 'OLAK5uy_kXq8wHn3T6BAu4B7ZUGsT3Uum0lZ7FjRM');
for (const link of [`https://www.youtube.com/watch?v=${id}&list=RD${id}`, `https://www.youtube.com/playlist?list=LL`, `https://www.youtube.com/playlist?list=WLabcdefghij`, `https://youtu.be/${id}`, `https://example.com/playlist?list=${list}`, 'not a link', '']) {
  assert.equal(parseYouTubePlaylist(link), null, `not a playlist to open: ${link}`);
}

function fakeBrowser(playlist, { fail = false } = {}) {
  const made = [];
  const element = () => ({ style: {}, children: [], setAttribute() {}, appendChild(child) { this.children.push(child); }, remove() { this.removed = true; } });
  const doc = { body: element(), head: element(), createElement: () => { const el = element(); made.push(el); return el; }, querySelector: () => ({}) };
  const players = [];
  class Player {
    constructor(mount, options) { this.options = options; players.push(this); setTimeout(() => (fail ? options.events.onError({ data: 150 }) : options.events.onReady()), 0); }
    getPlaylist() { return fail ? null : playlist; }
    cuePlaylist() {}
    destroy() { this.destroyed = true; }
  }
  return { win: { YT: { Player }, location: { origin: 'https://playgarba.com' } }, doc, players, made };
}
{
  const other = 'aaaaaaaaaaa';
  const fake = fakeBrowser([id, other, id, 'bad', other]);
  const ids = await resolveYouTubePlaylist(list, { win: fake.win, doc: fake.doc, timeoutMs: 2000 });
  assert.deepEqual(ids, [id, other], 'playlist ids come back in order, valid and without repeats');
  assert.equal(fake.players[0].options.playerVars.list, list);
  assert.equal(fake.players[0].options.playerVars.autoplay, 0, 'the probe player never plays');
  assert.ok(fake.players[0].destroyed && fake.made[0].removed, 'the probe player is removed afterwards');
  const failing = fakeBrowser(null, { fail: true });
  assert.deepEqual(await resolveYouTubePlaylist(list, { win: failing.win, doc: failing.doc, timeoutMs: 400 }), [], 'a private or empty playlist resolves empty');
  assert.deepEqual(await resolveYouTubePlaylist('nope', { win: fake.win, doc: fake.doc }), [], 'a malformed list id resolves empty');
}
pass('YouTube playlist links: list ids read, mixes and private lists left out; the probe player reads the ids in order and removes itself');

console.log('my songs tests passed');
