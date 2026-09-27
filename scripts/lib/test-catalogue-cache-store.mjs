import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CATALOGUE_CACHE_STORE_FORMAT_VERSION,
  CATALOGUE_CACHE_STORE_RECORD_KEY,
  createCatalogueCacheStore,
} from '../../src/catalogue/catalogue-cache-store.js';

const STORE_NAME = 'catalogue';

class FakeIndexedDB {
  constructor() {
    this.stores = new Map();
    this.failOpenOnce = false;
    this.blockOpenOnce = false;
    this.failTransactionOnce = false;
  }

  open() {
    const request = {};
    queueMicrotask(() => {
      if (this.failOpenOnce) {
        this.failOpenOnce = false;
        request.error = new Error('open failed');
        request.onerror?.({ target: request });
        return;
      }
      if (this.blockOpenOnce) {
        this.blockOpenOnce = false;
        request.onblocked?.({ target: request });
        return;
      }

      const db = this.#database();
      request.result = db;
      if (!this.stores.has(STORE_NAME)) request.onupgradeneeded?.({ target: request });
      queueMicrotask(() => request.onsuccess?.({ target: request }));
    });
    return request;
  }

  seed(storeName, key, value) {
    if (!this.stores.has(storeName)) this.stores.set(storeName, new Map());
    this.stores.get(storeName).set(key, structuredClone(value));
  }

  #database() {
    const factory = this;
    return {
      objectStoreNames: {
        contains(name) {
          return factory.stores.has(name);
        },
      },
      createObjectStore(name) {
        if (!factory.stores.has(name)) factory.stores.set(name, new Map());
      },
      transaction(name) {
        if (!factory.stores.has(name)) throw new Error('missing object store');
        return new FakeTransaction(factory, name);
      },
      close() {},
    };
  }
}

class FakeTransaction {
  constructor(factory, storeName) {
    this.factory = factory;
    this.storeName = storeName;
    this.completed = false;
    this.aborted = false;
  }

  objectStore(name) {
    if (name !== this.storeName) throw new Error('unexpected store');
    const records = this.factory.stores.get(name);
    return {
      get: (key) => this.#request(() => {
        const value = records.get(key);
        return value == null ? undefined : structuredClone(value);
      }),
      put: (record) => this.#request(() => {
        records.set(record.key, structuredClone(record));
        return record.key;
      }),
      delete: (key) => this.#request(() => {
        records.delete(key);
        return undefined;
      }),
    };
  }

  abort() {
    if (this.completed || this.aborted) return;
    this.aborted = true;
    queueMicrotask(() => this.onabort?.({ target: this }));
  }

  #request(operation) {
    const request = {};
    queueMicrotask(() => {
      if (this.factory.failTransactionOnce) {
        this.factory.failTransactionOnce = false;
        request.error = new Error('transaction failed');
        request.onerror?.({ target: request });
        this.error = request.error;
        queueMicrotask(() => this.onerror?.({ target: this }));
        return;
      }

      try {
        request.result = operation();
        request.onsuccess?.({ target: request });
        queueMicrotask(() => {
          if (this.aborted) return;
          this.completed = true;
          this.oncomplete?.({ target: this });
        });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
        this.error = error;
        queueMicrotask(() => this.onerror?.({ target: this }));
      }
    });
    return request;
  }
}

const utf8Bytes = (value) => Buffer.byteLength(value, 'utf8');

{
  const store = createCatalogueCacheStore({ indexedDBFactory: null });
  assert.deepEqual(await store.read(), { status: 'unavailable', reason: 'indexeddb-unavailable' });
  assert.deepEqual(
    await store.write({ revision: 'r1', schemaVersion: 's1', storedAtMs: 1, payload: {} }),
    { status: 'unavailable', reason: 'indexeddb-unavailable' },
  );
}

{
  const indexedDBFactory = new FakeIndexedDB();
  const store = createCatalogueCacheStore({ indexedDBFactory });
  const payload = {
    title: 'ઢોલી તારો ઢોલ બાજે',
    songs: ['ગરબા', 'રાસ'],
    nested: { available: true },
  };
  const payloadText = JSON.stringify(payload);

  const written = await store.write({
    revision: 'revision-a',
    schemaVersion: 'catalogue-v1',
    storedAtMs: 1234,
    sizeBytes: 1,
    payload,
  });
  assert.equal(written.status, 'written');
  assert.equal(written.metadata.sizeBytes, utf8Bytes(payloadText));
  assert.notEqual(written.metadata.sizeBytes, 1, 'caller-controlled byte counts must be ignored');

  const read = await store.read();
  assert.equal(read.status, 'ready');
  assert.deepEqual(read.record.payload, payload);
  assert.equal(read.record.payloadText, payloadText);
  assert.equal(read.record.revision, 'revision-a');
  assert.equal(read.record.schemaVersion, 'catalogue-v1');
  assert.equal(read.record.storedAtMs, 1234);
  assert.equal(read.record.sizeBytes, utf8Bytes(payloadText));

  const replacement = { songs: ['replacement'] };
  assert.equal((await store.write({
    revision: 'revision-b',
    schemaVersion: 'catalogue-v1',
    storedAtMs: 5678,
    payload: replacement,
  })).status, 'written');
  const replacedRead = await store.read();
  assert.equal(replacedRead.status, 'ready');
  assert.equal(replacedRead.record.revision, 'revision-b');
  assert.deepEqual(replacedRead.record.payload, replacement);

  assert.deepEqual(await store.delete(), { status: 'deleted' });
  assert.deepEqual(await store.read(), { status: 'missing' });
}

{
  const indexedDBFactory = new FakeIndexedDB();
  indexedDBFactory.failOpenOnce = true;
  const store = createCatalogueCacheStore({ indexedDBFactory });
  assert.deepEqual(await store.read(), { status: 'unavailable', reason: 'open-failed' });
}

{
  const indexedDBFactory = new FakeIndexedDB();
  indexedDBFactory.blockOpenOnce = true;
  const store = createCatalogueCacheStore({ indexedDBFactory });
  assert.deepEqual(await store.read(), { status: 'unavailable', reason: 'open-blocked' });
}

{
  const indexedDBFactory = new FakeIndexedDB();
  const store = createCatalogueCacheStore({ indexedDBFactory });
  assert.equal((await store.write({
    revision: 'stable',
    schemaVersion: 'catalogue-v1',
    storedAtMs: 10,
    payload: { songs: ['stable'] },
  })).status, 'written');

  indexedDBFactory.failTransactionOnce = true;
  assert.deepEqual(
    await store.write({
      revision: 'should-not-land',
      schemaVersion: 'catalogue-v1',
      storedAtMs: 11,
      payload: { songs: ['partial'] },
    }),
    { status: 'unavailable', reason: 'transaction-failed' },
  );

  const afterFailure = await store.read();
  assert.equal(afterFailure.status, 'ready');
  assert.equal(afterFailure.record.revision, 'stable');
  assert.deepEqual(afterFailure.record.payload, { songs: ['stable'] });
}

{
  const indexedDBFactory = new FakeIndexedDB();
  const store = createCatalogueCacheStore({ indexedDBFactory });
  assert.equal((await store.write({
    revision: 'seed',
    schemaVersion: 'catalogue-v1',
    storedAtMs: 20,
    payload: { songs: [] },
  })).status, 'written');

  indexedDBFactory.seed(STORE_NAME, CATALOGUE_CACHE_STORE_RECORD_KEY, {
    key: CATALOGUE_CACHE_STORE_RECORD_KEY,
    formatVersion: CATALOGUE_CACHE_STORE_FORMAT_VERSION,
    revision: 'corrupt',
    schemaVersion: 'catalogue-v1',
    storedAtMs: 20,
    sizeBytes: 999,
    payloadText: '{}',
  });
  const corruptRecord = await store.read();
  assert.equal(corruptRecord.status, 'invalid');
  assert.equal(corruptRecord.reason, 'corrupt-record');

  const brokenPayload = '{not-json';
  indexedDBFactory.seed(STORE_NAME, CATALOGUE_CACHE_STORE_RECORD_KEY, {
    key: CATALOGUE_CACHE_STORE_RECORD_KEY,
    formatVersion: CATALOGUE_CACHE_STORE_FORMAT_VERSION,
    revision: 'corrupt-payload',
    schemaVersion: 'catalogue-v1',
    storedAtMs: 20,
    sizeBytes: utf8Bytes(brokenPayload),
    payloadText: brokenPayload,
  });
  const corruptPayload = await store.read();
  assert.equal(corruptPayload.status, 'invalid');
  assert.equal(corruptPayload.reason, 'corrupt-payload');
}

{
  const indexedDBFactory = new FakeIndexedDB();
  const store = createCatalogueCacheStore({ indexedDBFactory });
  assert.deepEqual(
    await store.write({ revision: '', schemaVersion: 'catalogue-v1', storedAtMs: 1, payload: {} }),
    { status: 'invalid-input', reason: 'invalid-revision' },
  );
  assert.deepEqual(
    await store.write({ revision: 'r1', schemaVersion: '', storedAtMs: 1, payload: {} }),
    { status: 'invalid-input', reason: 'invalid-schema-version' },
  );
  assert.deepEqual(
    await store.write({ revision: 'r1', schemaVersion: 'catalogue-v1', storedAtMs: -1, payload: {} }),
    { status: 'invalid-input', reason: 'invalid-stored-at' },
  );
  assert.deepEqual(
    await store.write({ revision: 'r1', schemaVersion: 'catalogue-v1', storedAtMs: 1, payload: 1n }),
    { status: 'invalid-input', reason: 'payload-not-json' },
  );
}

const storeSource = await readFile(new URL('../../src/catalogue/catalogue-cache-store.js', import.meta.url), 'utf8');
for (const forbiddenPolicyToken of ['decideCatalogueCache', 'needsRefresh', 'shouldEvict', 'maxAgeMs', 'maxBytes', 'online']) {
  assert.equal(
    storeSource.includes(forbiddenPolicyToken),
    false,
    `cache store must not duplicate policy authority via ${forbiddenPolicyToken}`,
  );
}
assert.equal(storeSource.includes('localStorage'), false, 'full catalogue cache must not use synchronous localStorage');
assert.equal(storeSource.includes('fetch('), false, 'cache store must not perform network fetches');

console.log('✓ catalogue cache store round-trips one bounded IndexedDB record');
console.log('✓ catalogue cache store computes UTF-8 size internally and rejects malformed input/data');
console.log('✓ unavailable/open/transaction failures fail closed without overwriting the previous record');
console.log('✓ catalogue cache policy authority remains outside the storage module');
