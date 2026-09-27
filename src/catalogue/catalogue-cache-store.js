export const CATALOGUE_CACHE_STORE_FORMAT_VERSION = 1;
export const CATALOGUE_CACHE_STORE_RECORD_KEY = 'full-catalogue';

const DEFAULT_DB_NAME = 'playgarba-catalogue-cache';
const DEFAULT_STORE_NAME = 'catalogue';
const DEFAULT_DB_VERSION = 1;

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const finiteNonNegative = (value) => Number.isFinite(value) && value >= 0;
const immutable = (value) => Object.freeze(value);

const unavailable = (reason) => immutable({ status: 'unavailable', reason });
const invalidInput = (reason) => immutable({ status: 'invalid-input', reason });

const utf8Size = (value) => new TextEncoder().encode(value).byteLength;

function openDatabase(indexedDBFactory, dbName, storeName) {
  if (!indexedDBFactory || typeof indexedDBFactory.open !== 'function') {
    return Promise.resolve({ ok: false, reason: 'indexeddb-unavailable' });
  }

  return new Promise((resolve) => {
    let request;
    let settled = false;

    const finish = (result) => {
      if (settled) {
        if (result.ok) result.db?.close?.();
        return;
      }
      settled = true;
      resolve(result);
    };

    try {
      request = indexedDBFactory.open(dbName, DEFAULT_DB_VERSION);
    } catch {
      finish({ ok: false, reason: 'open-failed' });
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => finish({ ok: true, db: request.result });
    request.onerror = () => finish({ ok: false, reason: 'open-failed' });
    request.onblocked = () => finish({ ok: false, reason: 'open-blocked' });
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('indexeddb-request-failed'));
  });
}

function transactionCompletion(transaction) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    transaction.oncomplete = () => finish({ ok: true });
    transaction.onerror = () => finish({ ok: false, reason: 'transaction-failed' });
    transaction.onabort = () => finish({ ok: false, reason: 'transaction-aborted' });
  });
}

async function runTransaction({ indexedDBFactory, dbName, storeName, mode, operation }) {
  const opened = await openDatabase(indexedDBFactory, dbName, storeName);
  if (!opened.ok) return opened;

  const { db } = opened;
  try {
    let transaction;
    let objectStore;
    try {
      transaction = db.transaction(storeName, mode);
      objectStore = transaction.objectStore(storeName);
    } catch {
      return { ok: false, reason: 'transaction-failed' };
    }

    const completion = transactionCompletion(transaction);
    let value;
    try {
      value = await operation(objectStore);
    } catch {
      try { transaction.abort?.(); } catch { /* transaction may already be inactive */ }
      await completion;
      return { ok: false, reason: 'transaction-failed' };
    }

    const completed = await completion;
    if (!completed.ok) return completed;
    return { ok: true, value };
  } finally {
    db.close?.();
  }
}

function validStoredRecord(record, recordKey) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (record.key !== recordKey) return false;
  if (record.formatVersion !== CATALOGUE_CACHE_STORE_FORMAT_VERSION) return false;
  if (!nonEmptyString(record.revision) || !nonEmptyString(record.schemaVersion)) return false;
  if (!finiteNonNegative(record.storedAtMs)) return false;
  if (!Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 0) return false;
  if (typeof record.payloadText !== 'string') return false;
  return utf8Size(record.payloadText) === record.sizeBytes;
}

export function createCatalogueCacheStore({
  indexedDBFactory = globalThis.indexedDB,
  dbName = DEFAULT_DB_NAME,
  storeName = DEFAULT_STORE_NAME,
  recordKey = CATALOGUE_CACHE_STORE_RECORD_KEY,
} = {}) {
  if (!nonEmptyString(dbName) || !nonEmptyString(storeName) || !nonEmptyString(recordKey)) {
    throw new TypeError('Catalogue cache store names must be non-empty strings');
  }

  const transactionOptions = { indexedDBFactory, dbName, storeName };

  return immutable({
    async read() {
      const result = await runTransaction({
        ...transactionOptions,
        mode: 'readonly',
        operation: (objectStore) => requestValue(objectStore.get(recordKey)),
      });

      if (!result.ok) return unavailable(result.reason);
      if (result.value == null) return immutable({ status: 'missing' });
      if (!validStoredRecord(result.value, recordKey)) {
        return immutable({ status: 'invalid', reason: 'corrupt-record', cache: result.value });
      }

      let payload;
      try {
        payload = JSON.parse(result.value.payloadText);
      } catch {
        return immutable({ status: 'invalid', reason: 'corrupt-payload', cache: result.value });
      }

      return immutable({
        status: 'ready',
        record: immutable({
          revision: result.value.revision,
          schemaVersion: result.value.schemaVersion,
          storedAtMs: result.value.storedAtMs,
          sizeBytes: result.value.sizeBytes,
          payload,
          payloadText: result.value.payloadText,
        }),
      });
    },

    async write({ revision, schemaVersion, storedAtMs, payload } = {}) {
      if (!nonEmptyString(revision)) return invalidInput('invalid-revision');
      if (!nonEmptyString(schemaVersion)) return invalidInput('invalid-schema-version');
      if (!finiteNonNegative(storedAtMs)) return invalidInput('invalid-stored-at');

      let payloadText;
      try {
        payloadText = JSON.stringify(payload);
      } catch {
        return invalidInput('payload-not-json');
      }
      if (typeof payloadText !== 'string') return invalidInput('payload-not-json');

      const sizeBytes = utf8Size(payloadText);
      const storedRecord = {
        key: recordKey,
        formatVersion: CATALOGUE_CACHE_STORE_FORMAT_VERSION,
        revision,
        schemaVersion,
        storedAtMs,
        sizeBytes,
        payloadText,
      };

      const result = await runTransaction({
        ...transactionOptions,
        mode: 'readwrite',
        operation: (objectStore) => requestValue(objectStore.put(storedRecord)),
      });
      if (!result.ok) return unavailable(result.reason);

      return immutable({
        status: 'written',
        metadata: immutable({ revision, schemaVersion, storedAtMs, sizeBytes }),
      });
    },

    async delete() {
      const result = await runTransaction({
        ...transactionOptions,
        mode: 'readwrite',
        operation: (objectStore) => requestValue(objectStore.delete(recordKey)),
      });
      if (!result.ok) return unavailable(result.reason);
      return immutable({ status: 'deleted' });
    },
  });
}
