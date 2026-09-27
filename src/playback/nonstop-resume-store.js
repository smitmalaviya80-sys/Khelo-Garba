export const NONSTOP_RESUME_STORE_VERSION = 1;
export const NONSTOP_RESUME_STORAGE_KEY = 'garba:nonstop-resume:v1';
export const DEFAULT_NONSTOP_RESUME_LIMIT = 8;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isFiniteNonNegative = (value) => Number.isFinite(value) && value >= 0;
const isFinitePositive = (value) => Number.isFinite(value) && value > 0;

function freezeRecord(record) {
  return Object.freeze({ ...record });
}

function freezeResult(result) {
  return Object.freeze({ ...result });
}

function normalizeIdentity(value) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function validRecord(record) {
  return isObject(record)
    && normalizeIdentity(record.setId) !== null
    && normalizeIdentity(record.sourceIdentity) !== null
    && isFiniteNonNegative(record.positionSeconds)
    && (record.durationSeconds === null || isFinitePositive(record.durationSeconds))
    && isFiniteNonNegative(record.updatedAtMs);
}

function sortNewestFirst(entries) {
  return [...entries].sort((left, right) => right.updatedAtMs - left.updatedAtMs);
}

function parseEnvelope(raw) {
  if (raw == null) return { status: 'empty', entries: [] };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', entries: [] };
  }

  if (!isObject(parsed)
      || parsed.version !== NONSTOP_RESUME_STORE_VERSION
      || !Array.isArray(parsed.entries)
      || parsed.entries.some((entry) => !validRecord(entry))) {
    return { status: 'corrupt', entries: [] };
  }

  const seen = new Set();
  for (const entry of parsed.entries) {
    const normalizedSetId = entry.setId.trim();
    if (seen.has(normalizedSetId)) return { status: 'corrupt', entries: [] };
    seen.add(normalizedSetId);
  }

  return {
    status: 'ok',
    entries: parsed.entries.map((entry) => ({
      setId: entry.setId.trim(),
      sourceIdentity: entry.sourceIdentity.trim(),
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      updatedAtMs: entry.updatedAtMs,
      ...(isNonEmptyString(entry.title) ? { title: entry.title.trim() } : {}),
      ...(isNonEmptyString(entry.artist) ? { artist: entry.artist.trim() } : {}),
    })),
  };
}

export function createNonstopResumeStore({
  storage,
  storageKey = NONSTOP_RESUME_STORAGE_KEY,
  maxEntries = DEFAULT_NONSTOP_RESUME_LIMIT,
  now = () => Date.now(),
} = {}) {
  const storageReady = storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function'
    && typeof storage.removeItem === 'function';
  const validStorageKey = normalizeIdentity(storageKey);
  const boundedLimit = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_NONSTOP_RESUME_LIMIT;

  function load() {
    if (!storageReady || validStorageKey === null) return { status: 'unavailable', entries: [] };
    try {
      return parseEnvelope(storage.getItem(validStorageKey));
    } catch {
      return { status: 'unavailable', entries: [] };
    }
  }

  function persist(entries) {
    if (!storageReady || validStorageKey === null) return false;
    const envelope = {
      version: NONSTOP_RESUME_STORE_VERSION,
      entries: sortNewestFirst(entries).slice(0, boundedLimit),
    };
    try {
      storage.setItem(validStorageKey, JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  function read(setId, sourceIdentity) {
    const normalizedSetId = normalizeIdentity(setId);
    const normalizedSource = normalizeIdentity(sourceIdentity);
    if (normalizedSetId === null || normalizedSource === null) {
      return freezeResult({ status: 'invalid', record: null });
    }

    const loaded = load();
    if (loaded.status === 'unavailable') return freezeResult({ status: 'unavailable', record: null });
    if (loaded.status === 'corrupt') return freezeResult({ status: 'corrupt', record: null });

    const record = loaded.entries.find((entry) => entry.setId === normalizedSetId);
    if (!record) return freezeResult({ status: 'missing', record: null });

    if (record.sourceIdentity !== normalizedSource) {
      const remaining = loaded.entries.filter((entry) => entry.setId !== normalizedSetId);
      persist(remaining);
      return freezeResult({ status: 'source-changed', record: null });
    }

    return freezeResult({ status: 'found', record: freezeRecord(record) });
  }

  function remove(setId) {
    const normalizedSetId = normalizeIdentity(setId);
    if (normalizedSetId === null) return freezeResult({ status: 'invalid' });

    const loaded = load();
    if (loaded.status === 'unavailable') return freezeResult({ status: 'unavailable' });
    if (loaded.status === 'corrupt') {
      if (!persist([])) return freezeResult({ status: 'unavailable' });
      return freezeResult({ status: 'corrupt-cleared' });
    }

    const remaining = loaded.entries.filter((entry) => entry.setId !== normalizedSetId);
    if (remaining.length === loaded.entries.length) return freezeResult({ status: 'missing' });
    return persist(remaining)
      ? freezeResult({ status: 'removed' })
      : freezeResult({ status: 'unavailable' });
  }

  function write({
    setId,
    sourceIdentity,
    positionSeconds,
    durationSeconds = null,
    completed = false,
    title = null,
    artist = null,
  } = {}) {
    const normalizedSetId = normalizeIdentity(setId);
    const normalizedSource = normalizeIdentity(sourceIdentity);
    const updatedAtMs = Number(now());

    if (normalizedSetId === null
        || normalizedSource === null
        || !isFiniteNonNegative(positionSeconds)
        || !(durationSeconds === null || isFinitePositive(durationSeconds))
        || typeof completed !== 'boolean'
        || !isFiniteNonNegative(updatedAtMs)) {
      return freezeResult({ status: 'invalid', record: null });
    }

    const loaded = load();
    if (loaded.status === 'unavailable') return freezeResult({ status: 'unavailable', record: null });

    const entries = loaded.status === 'corrupt' ? [] : loaded.entries;
    const existing = entries.find((entry) => entry.setId === normalizedSetId);
    if (existing && existing.sourceIdentity !== normalizedSource) {
      return freezeResult({ status: 'source-mismatch', record: null });
    }

    if (completed) {
      const remaining = entries.filter((entry) => entry.setId !== normalizedSetId);
      if (!persist(remaining)) return freezeResult({ status: 'unavailable', record: null });
      return freezeResult({ status: 'completed-cleared', record: null });
    }

    const record = {
      setId: normalizedSetId,
      sourceIdentity: normalizedSource,
      positionSeconds,
      durationSeconds,
      updatedAtMs,
      ...(isNonEmptyString(title) ? { title: title.trim() } : {}),
      ...(isNonEmptyString(artist) ? { artist: artist.trim() } : {}),
    };
    const nextEntries = [record, ...entries.filter((entry) => entry.setId !== normalizedSetId)];

    if (!persist(nextEntries)) return freezeResult({ status: 'unavailable', record: null });
    return freezeResult({
      status: loaded.status === 'corrupt' ? 'stored-after-corrupt-reset' : 'stored',
      record: freezeRecord(record),
    });
  }

  function list() {
    const loaded = load();
    if (loaded.status === 'unavailable') return freezeResult({ status: 'unavailable', records: Object.freeze([]) });
    if (loaded.status === 'corrupt') return freezeResult({ status: 'corrupt', records: Object.freeze([]) });
    return freezeResult({
      status: loaded.status === 'empty' ? 'empty' : 'ok',
      records: Object.freeze(sortNewestFirst(loaded.entries).map(freezeRecord)),
    });
  }

  return Object.freeze({ read, write, remove, list });
}
