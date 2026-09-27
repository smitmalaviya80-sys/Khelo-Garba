import assert from 'node:assert/strict';
import { CATALOGUE_CACHE_ACTIONS, decideCatalogueCache } from '../../src/catalogue/catalogue-cache-policy.js';

const base = Object.freeze({
  expectedRevision: 'catalogue-r2',
  expectedSchemaVersion: 'catalogue-v1',
  online: true,
  nowMs: 2_000_000,
  maxAgeMs: 1_000_000,
  maxBytes: 2_000_000,
});

const cache = Object.freeze({
  revision: 'catalogue-r2',
  schemaVersion: 'catalogue-v1',
  storedAtMs: 1_500_000,
  sizeBytes: 1_400_000,
  canonicalSongIds: Object.freeze(['song-a', 'song-b']),
});

const decide = (overrides = {}) => decideCatalogueCache({ ...base, cache, ...overrides });

assert.deepEqual(decide(), {
  action: CATALOGUE_CACHE_ACTIONS.REUSE_CURRENT,
  cacheStatus: 'current',
  reason: 'revision-match',
  canUseCache: true,
  needsRefresh: false,
  shouldEvict: false,
});

assert.equal(decide({ online: false }).action, CATALOGUE_CACHE_ACTIONS.REUSE_CURRENT);
assert.equal(decide({ cache: null }).action, CATALOGUE_CACHE_ACTIONS.REFRESH);
assert.equal(decide({ cache: null, online: false }).action, CATALOGUE_CACHE_ACTIONS.UNAVAILABLE);

const staleOnline = decide({ cache: { ...cache, revision: 'catalogue-r1' } });
assert.equal(staleOnline.action, CATALOGUE_CACHE_ACTIONS.REFRESH);
assert.equal(staleOnline.cacheStatus, 'stale');
assert.equal(staleOnline.canUseCache, false);
assert.equal(staleOnline.needsRefresh, true);

const staleOffline = decide({ cache: { ...cache, revision: 'catalogue-r1' }, online: false });
assert.equal(staleOffline.action, CATALOGUE_CACHE_ACTIONS.REUSE_STALE);
assert.equal(staleOffline.cacheStatus, 'stale');
assert.equal(staleOffline.reason, 'revision-mismatch-offline');
assert.equal(staleOffline.canUseCache, true);

for (const malformed of [
  { ...cache, revision: '' },
  { ...cache, schemaVersion: '' },
  { ...cache, storedAtMs: -1 },
  { ...cache, storedAtMs: Number.NaN },
  { ...cache, storedAtMs: base.nowMs + 1 },
  { ...cache, sizeBytes: -1 },
  { ...cache, sizeBytes: Number.POSITIVE_INFINITY },
]) {
  const result = decide({ cache: malformed });
  assert.equal(result.action, CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH);
  assert.equal(result.cacheStatus, 'invalid');
  assert.equal(result.shouldEvict, true);
}

const schemaMismatch = decide({ cache: { ...cache, schemaVersion: 'catalogue-v0' } });
assert.equal(schemaMismatch.action, CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH);
assert.equal(schemaMismatch.reason, 'schema-mismatch');
assert.equal(decide({ cache: { ...cache, schemaVersion: 'catalogue-v0' }, online: false }).action, CATALOGUE_CACHE_ACTIONS.EVICT);

const oversized = decide({ cache: { ...cache, sizeBytes: base.maxBytes + 1 } });
assert.equal(oversized.action, CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH);
assert.equal(oversized.reason, 'cache-byte-limit-exceeded');
assert.equal(decide({ cache: { ...cache, sizeBytes: base.maxBytes + 1 }, online: false }).action, CATALOGUE_CACHE_ACTIONS.EVICT);

const aged = decide({ cache: { ...cache, storedAtMs: base.nowMs - base.maxAgeMs - 1 } });
assert.equal(aged.action, CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH);
assert.equal(aged.reason, 'cache-age-limit-exceeded');
assert.equal(decide({ cache: { ...cache, storedAtMs: base.nowMs - base.maxAgeMs - 1 }, online: false }).action, CATALOGUE_CACHE_ACTIONS.EVICT);

assert.equal(decide({ cache: { ...cache, sizeBytes: base.maxBytes } }).action, CATALOGUE_CACHE_ACTIONS.REUSE_CURRENT);
assert.equal(decide({ cache: { ...cache, storedAtMs: base.nowMs - base.maxAgeMs } }).action, CATALOGUE_CACHE_ACTIONS.REUSE_CURRENT);

assert.equal(decideCatalogueCache({ ...base, cache, expectedRevision: '' }).reason, 'invalid-expected-revision');
assert.equal(decideCatalogueCache({ ...base, cache, expectedSchemaVersion: '' }).reason, 'invalid-expected-schema-version');
assert.equal(decideCatalogueCache({ ...base, cache, online: 'yes' }).reason, 'invalid-online-state');
assert.equal(decideCatalogueCache({ ...base, cache, maxBytes: 0 }).reason, 'invalid-cache-policy');

const orderedA = decide({ cache: { revision: 'catalogue-r2', schemaVersion: 'catalogue-v1', storedAtMs: 1_500_000, sizeBytes: 1_400_000, unrelated: 'a' } });
const orderedB = decide({ cache: { unrelated: 'b', sizeBytes: 1_400_000, storedAtMs: 1_500_000, schemaVersion: 'catalogue-v1', revision: 'catalogue-r2' } });
assert.deepEqual(orderedA, orderedB);

const mutableInput = {
  ...base,
  cache: {
    ...cache,
    canonicalSongIds: ['song-a', 'song-b'],
  },
};
const before = structuredClone(mutableInput);
decideCatalogueCache(mutableInput);
assert.deepEqual(mutableInput, before);

for (const result of [decide(), staleOnline, staleOffline, schemaMismatch, oversized, aged]) {
  assert.equal(Object.isFrozen(result), true);
}

console.log('catalogue-cache-policy: all tests passed');
