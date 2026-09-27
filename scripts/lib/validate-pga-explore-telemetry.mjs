import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createExploreTelemetryAdapter } from '../../src/catalogue/explore-telemetry.js';

const calls = [];
let nextSearch = 0;
const bridge = {
  surfaceViewed(fields) {
    calls.push(['surfaceViewed', fields]);
    return true;
  },
  searchSubmitted(fields) {
    const id = `search-${++nextSearch}`;
    calls.push(['searchSubmitted', fields, id]);
    return id;
  },
  searchZeroResults(fields) {
    calls.push(['searchZeroResults', fields]);
    return true;
  },
  searchResultSelected(fields) {
    calls.push(['searchResultSelected', fields]);
    return true;
  },
  collectionSelected(fields) {
    calls.push(['collectionSelected', fields]);
    return true;
  },
};

let resolveBridge;
const deferredBridge = new Promise((resolve) => { resolveBridge = resolve; });
const adapter = createExploreTelemetryAdapter({ loadBridge: () => deferredBridge });

const warmOne = adapter.warm();
const warmTwo = adapter.warm();
const staleGeneration = adapter.beginSearchInput('Maa');
const staleSearch = adapter.settleSearch({ query: 'Maa', resultCount: 0, generation: staleGeneration });
const currentGeneration = adapter.beginSearchInput('Mataji');
resolveBridge(bridge);

assert.equal(await warmOne, true, 'warm should fail open after the bridge becomes available');
assert.equal(await warmTwo, true, 'repeated warm should reuse the same bridge');
assert.equal(await staleSearch, null, 'an older search must not survive a newer input generation');
assert.equal(calls.filter(([name]) => name === 'surfaceViewed').length, 1, 'surface view must be attempted once per adapter lifecycle');

const currentSearchId = await adapter.settleSearch({
  query: 'Mataji',
  resultCount: 0,
  generation: currentGeneration,
});
assert.equal(currentSearchId, 'search-1');
assert.deepEqual(calls.at(-2), ['searchSubmitted', { searchTerm: 'Mataji' }, 'search-1']);
assert.deepEqual(calls.at(-1), ['searchZeroResults', { searchId: 'search-1' }]);

const submittedCount = calls.filter(([name]) => name === 'searchSubmitted').length;
assert.equal(
  await adapter.settleSearch({ query: 'Mataji', resultCount: 0, generation: currentGeneration }),
  'search-1',
  'an identical settled query should reuse the active correlation rather than emit again',
);
assert.equal(calls.filter(([name]) => name === 'searchSubmitted').length, submittedCount);

assert.equal(adapter.recordSongSelection({
  songId: 'song-123',
  world: 'devotional',
  fromSearch: true,
  searchQuery: 'Different query',
}), false, 'a result from a different query must not cross-link to the active search');

assert.equal(adapter.recordSongSelection({
  songId: 'song-123',
  world: 'devotional',
  fromSearch: true,
  searchQuery: 'Mataji',
}), true, 'the exact active search may correlate a canonical song selection');
assert.deepEqual(calls.at(-1), ['searchResultSelected', {
  searchId: 'search-1',
  contentType: 'song',
  contentId: 'song-123',
  world: 'devotional',
}]);

adapter.beginSearchInput('');
assert.equal(adapter.recordSongSelection({
  songId: 'song-123',
  fromSearch: true,
  searchQuery: 'Mataji',
}), false, 'clearing a query must invalidate the previous search correlation immediately');

assert.equal(adapter.recordSongSelection({
  songId: 'song-456',
  world: 'folk',
  fromSearch: false,
}), true, 'a non-search canonical song choice may be recorded as an Explore collection selection');
assert.deepEqual(calls.at(-1), ['collectionSelected', {
  contentType: 'song',
  contentId: 'song-456',
  world: 'folk',
}]);

assert.equal(adapter.recordReleaseSelection({ releaseId: 'release-7', fromSearch: false }), true);
assert.deepEqual(calls.at(-1), ['collectionSelected', {
  contentType: 'release',
  contentId: 'release-7',
}]);
assert.equal(adapter.recordReleaseSelection({ releaseId: 'release-7', fromSearch: true }), false);
assert.equal(adapter.recordSongSelection({ songId: '../unsafe', fromSearch: false }), false, 'invalid canonical IDs must fail closed');

const retryGeneration = adapter.beginSearchInput('Mataji');
assert.equal(await adapter.settleSearch({ query: 'Mataji', resultCount: 1, generation: retryGeneration }), 'search-2', 'clearing then deliberately searching again may create a fresh correlation');

const broken = createExploreTelemetryAdapter({ loadBridge: async () => { throw new Error('offline'); } });
assert.equal(await broken.warm(), false, 'telemetry load failure must not throw into Explore');
const brokenGeneration = broken.beginSearchInput('garba');
assert.equal(await broken.settleSearch({ query: 'garba', resultCount: 0, generation: brokenGeneration }), null);
assert.equal(broken.recordSongSelection({ songId: 'song-1' }), false);
assert.equal(broken.recordReleaseSelection({ releaseId: 'release-1' }), false);

const [source, index, workflow] = await Promise.all([
  readFile(new URL('../../src/catalogue/explore-telemetry.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/catalogue/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/pga-explore-telemetry-validate.yml', import.meta.url), 'utf8'),
]);

assert.match(index, /import\('\.\/explore-telemetry\.js'\)\.catch\(\(\) => \{\}\)/, 'production Explore must dynamically load the isolated adapter');
assert.match(index, /\['localhost', '127\.0\.0\.1', '::1'\]\.includes\(location\.hostname\)/, 'static loopback fixtures must not request the production telemetry module graph');
assert.doesNotMatch(index, /<script type="module" src="explore-telemetry\.js"><\/script>/, 'fixture-visible HTML must not eagerly request the telemetry adapter');
assert.match(source, /import\('\.\.\/pga\/telemetry\/index\.js'\)/, 'telemetry core must be dynamically imported');
assert.match(source, /import\('\.\.\/pga\/telemetry\/product-bridge\.js'\)/, 'semantic bridge must be dynamically imported');
assert.match(source, /event\.isTrusted !== true/, 'programmatic input/click replay must be rejected');
assert.match(source, /SEARCH_SETTLE_MS = 550/, 'telemetry search settling must stay separate from the 90 ms catalogue render debounce');
assert.match(source, /queryFromHash/, 'search selection correlation must distinguish active search state from ordinary browsing');
assert.doesNotMatch(source, /\.track\s*\(/, 'Explore must not bypass ProductTelemetryBridge with raw telemetry.track calls');
assert.doesNotMatch(source, /playIntent|providerPlaybackStarted|playbackStarted|playbackPaused|playbackResumed|playbackEnded/, 'Explore navigation must not fabricate playback lifecycle analytics');
assert.doesNotMatch(source, /userAgent|document\.cookie|localStorage|sessionStorage/, 'Explore adapter must not add fingerprint, cookie or storage capture');
assert.match(workflow, /actions\/checkout@v6/);
assert.match(workflow, /actions\/setup-node@v5/);
assert.match(workflow, /node-version: 22/);

console.log('PGA Explore telemetry validation passed');
