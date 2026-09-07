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

test('search results include the docId and page each chunk was tagged with', async () => {
  const store = new VectorStore({ dbPath: tempDbPath() });
  await store.addChunks('t1', [
    { text: 'from a pdf page', embedding: [1, 0], docId: 'doc1', page: 3 },
    { text: 'from plain text, no page', embedding: [0, 1], docId: 'doc2' },
  ]);

  const results = await store.search('t1', [1, 0], 5);
  const pdfResult = results.find((r) => r.text === 'from a pdf page');
  const textResult = results.find((r) => r.text === 'from plain text, no page');

  assert.deepEqual({ docId: pdfResult.docId, page: pdfResult.page }, { docId: 'doc1', page: 3 });
  assert.deepEqual({ docId: textResult.docId, page: textResult.page }, { docId: 'doc2', page: 0 });
  await store.close();
});

test('addChunks migrates a table created before the page column existed, instead of failing', async () => {
  const dbPath = tempDbPath();
  // Simulate a table from before this feature: no `page` field at all.
  const lancedb = require('@lancedb/lancedb');
  const db = await lancedb.connect(dbPath);
  await db.createTable('tenant_t1', [{ id: 'old_1', text: 'old chunk, no page column', vector: [1, 0, 0], docId: 'doc1' }]);

  const store = new VectorStore({ dbPath });
  await store.addChunks('t1', [{ text: 'new chunk with a page', embedding: [0, 1, 0], docId: 'doc2', page: 2 }]);

  const results = await store.search('t1', [0, 1, 0], 5);
  const newResult = results.find((r) => r.text === 'new chunk with a page');
  assert.equal(newResult.page, 2);
  assert.equal(typeof newResult.page, 'number', 'page must be a plain number, not a BigInt (JSON.stringify cannot serialize BigInt)');
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

test('deleteDocument handles a docId containing a single quote correctly', async () => {
  const store = new VectorStore({ dbPath: tempDbPath() });
  await store.addChunks('t1', [
    { text: 'from doc with quote', embedding: [1, 0], docId: "nha hang's menu.md_123" },
    { text: 'from a different doc', embedding: [1, 0], docId: 'other-doc' },
  ]);

  await store.deleteDocument('t1', "nha hang's menu.md_123");
  const results = await store.search('t1', [1, 0], 10);

  assert.equal(results.length, 1);
  assert.equal(results[0].text, 'from a different doc');
  await store.close();
});
