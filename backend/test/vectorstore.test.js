'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { VectorStore } = require('../src/vectorstore');

function tempDbPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vectorstore-test-')), 'lance');
}

test('adds chunks for a tenant and finds the closest match by search', async () => {
  const store = new VectorStore({ dbPath: tempDbPath() });
  await store.addChunks('t1', [
    { text: 'mon an: pho bo', embedding: [1, 0, 0], docId: 'doc1' },
    { text: 'mon an: banh mi', embedding: [0, 1, 0], docId: 'doc1' },
    { text: 'gio mo cua: 7h-22h', embedding: [0, 0, 1], docId: 'doc2' },
  ]);

  const results = await store.search('t1', [0.9, 0.1, 0], 1);

  assert.equal(results.length, 1);
  assert.equal(results[0].text, 'mon an: pho bo');
  assert.ok(typeof results[0].score === 'number');
  await store.close();
});

test('keeps different tenants isolated', async () => {
  const store = new VectorStore({ dbPath: tempDbPath() });
  await store.addChunks('t1', [{ text: 'tenant one data', embedding: [1, 0], docId: 'd1' }]);
  await store.addChunks('t2', [{ text: 'tenant two data', embedding: [1, 0], docId: 'd1' }]);

  const t1Results = await store.search('t1', [1, 0], 5);
  assert.equal(t1Results.length, 1);
  assert.equal(t1Results[0].text, 'tenant one data');

  const t2Results = await store.search('t2', [1, 0], 5);
  assert.equal(t2Results.length, 1);
  assert.equal(t2Results[0].text, 'tenant two data');
  await store.close();
});

test('search on a tenant with no chunks yet returns an empty array', async () => {
  const store = new VectorStore({ dbPath: tempDbPath() });
  const results = await store.search('nonexistent-tenant', [1, 0], 5);
  assert.deepEqual(results, []);
  await store.close();
});

test('deleteDocument removes only chunks belonging to that document', async () => {
  const store = new VectorStore({ dbPath: tempDbPath() });
  await store.addChunks('t1', [
    { text: 'from doc1', embedding: [1, 0], docId: 'doc1' },
    { text: 'from doc2', embedding: [1, 0], docId: 'doc2' },
  ]);

  await store.deleteDocument('t1', 'doc1');
  const results = await store.search('t1', [1, 0], 10);

  assert.equal(results.length, 1);
  assert.equal(results[0].text, 'from doc2');
  await store.close();
});
