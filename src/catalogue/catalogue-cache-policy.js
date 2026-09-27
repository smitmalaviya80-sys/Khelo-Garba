export const CATALOGUE_CACHE_ACTIONS = Object.freeze({
  REUSE_CURRENT: 'reuse-current',
  REUSE_STALE: 'reuse-stale',
  REFRESH: 'refresh',
  EVICT_AND_REFRESH: 'evict-and-refresh',
  EVICT: 'evict',
  UNAVAILABLE: 'unavailable',
});

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const finiteNonNegative = (value) => Number.isFinite(value) && value >= 0;
const finitePositive = (value) => Number.isFinite(value) && value > 0;

const decision = (action, cacheStatus, reason, overrides = {}) => Object.freeze({
  action,
  cacheStatus,
  reason,
  canUseCache: false,
  needsRefresh: false,
  shouldEvict: false,
  ...overrides,
});

export function decideCatalogueCache({
  expectedRevision,
  expectedSchemaVersion,
  cache = null,
  online,
  nowMs,
  maxAgeMs,
  maxBytes,
} = {}) {
  if (!nonEmptyString(expectedRevision)) {
    return decision(CATALOGUE_CACHE_ACTIONS.UNAVAILABLE, 'invalid', 'invalid-expected-revision');
  }
  if (!nonEmptyString(expectedSchemaVersion)) {
    return decision(CATALOGUE_CACHE_ACTIONS.UNAVAILABLE, 'invalid', 'invalid-expected-schema-version');
  }
  if (typeof online !== 'boolean') {
    return decision(CATALOGUE_CACHE_ACTIONS.UNAVAILABLE, 'invalid', 'invalid-online-state');
  }
  if (!finiteNonNegative(nowMs) || !finitePositive(maxAgeMs) || !finitePositive(maxBytes)) {
    return decision(CATALOGUE_CACHE_ACTIONS.UNAVAILABLE, 'invalid', 'invalid-cache-policy');
  }

  if (cache == null) {
    return online
      ? decision(CATALOGUE_CACHE_ACTIONS.REFRESH, 'missing', 'cache-missing', { needsRefresh: true })
      : decision(CATALOGUE_CACHE_ACTIONS.UNAVAILABLE, 'missing', 'cache-missing-offline');
  }

  if (typeof cache !== 'object' || Array.isArray(cache)) {
    return online
      ? decision(CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH, 'invalid', 'cache-malformed', { needsRefresh: true, shouldEvict: true })
      : decision(CATALOGUE_CACHE_ACTIONS.EVICT, 'invalid', 'cache-malformed-offline', { shouldEvict: true });
  }

  const revisionValid = nonEmptyString(cache.revision);
  const schemaValid = nonEmptyString(cache.schemaVersion);
  const storedAtValid = finiteNonNegative(cache.storedAtMs) && cache.storedAtMs <= nowMs;
  const sizeValid = finiteNonNegative(cache.sizeBytes);

  if (!revisionValid || !schemaValid || !storedAtValid || !sizeValid) {
    return online
      ? decision(CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH, 'invalid', 'cache-metadata-invalid', { needsRefresh: true, shouldEvict: true })
      : decision(CATALOGUE_CACHE_ACTIONS.EVICT, 'invalid', 'cache-metadata-invalid-offline', { shouldEvict: true });
  }

  if (cache.schemaVersion !== expectedSchemaVersion) {
    return online
      ? decision(CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH, 'invalid', 'schema-mismatch', { needsRefresh: true, shouldEvict: true })
      : decision(CATALOGUE_CACHE_ACTIONS.EVICT, 'invalid', 'schema-mismatch-offline', { shouldEvict: true });
  }

  if (cache.sizeBytes > maxBytes) {
    return online
      ? decision(CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH, 'invalid', 'cache-byte-limit-exceeded', { needsRefresh: true, shouldEvict: true })
      : decision(CATALOGUE_CACHE_ACTIONS.EVICT, 'invalid', 'cache-byte-limit-exceeded-offline', { shouldEvict: true });
  }

  if ((nowMs - cache.storedAtMs) > maxAgeMs) {
    return online
      ? decision(CATALOGUE_CACHE_ACTIONS.EVICT_AND_REFRESH, 'invalid', 'cache-age-limit-exceeded', { needsRefresh: true, shouldEvict: true })
      : decision(CATALOGUE_CACHE_ACTIONS.EVICT, 'invalid', 'cache-age-limit-exceeded-offline', { shouldEvict: true });
  }

  if (cache.revision === expectedRevision) {
    return decision(CATALOGUE_CACHE_ACTIONS.REUSE_CURRENT, 'current', 'revision-match', { canUseCache: true });
  }

  if (!online) {
    return decision(CATALOGUE_CACHE_ACTIONS.REUSE_STALE, 'stale', 'revision-mismatch-offline', { canUseCache: true });
  }

  return decision(CATALOGUE_CACHE_ACTIONS.REFRESH, 'stale', 'revision-mismatch', { needsRefresh: true });
}
