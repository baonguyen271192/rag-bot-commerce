'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { TenantStore } = require('../src/db');

test('creates and retrieves a tenant', () => {
  const store = new TenantStore(':memory:');
  const created = store.createTenant({ id: 't1', name: 'Truc Lam Vien', systemPrompt: 'Ban la tro ly nha hang.' });
  assert.equal(created.id, 't1');
  assert.equal(created.name, 'Truc Lam Vien');
  assert.equal(created.systemPrompt, 'Ban la tro ly nha hang.');

  const fetched = store.getTenant('t1');
  assert.equal(fetched.id, 't1');
  assert.equal(fetched.name, 'Truc Lam Vien');
  store.close();
});

test('returns null for an unknown tenant', () => {
  const store = new TenantStore(':memory:');
  assert.equal(store.getTenant('unknown'), null);
  store.close();
});

test('lists all tenants', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p1' });
  store.createTenant({ id: 't2', name: 'B', systemPrompt: 'p2' });
  const all = store.listTenants();
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((t) => t.id).sort(), ['t1', 't2']);
  store.close();
});

test('updates a tenant system prompt', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'old' });
  store.updateTenantPrompt('t1', 'new prompt');
  assert.equal(store.getTenant('t1').systemPrompt, 'new prompt');
  store.close();
});

test('stores and retrieves recent messages in chronological order', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addMessage({ tenantId: 't1', conversationId: 'c1', role: 'user', text: 'hi' });
  store.addMessage({ tenantId: 't1', conversationId: 'c1', role: 'assistant', text: 'hello' });
  store.addMessage({ tenantId: 't1', conversationId: 'c1', role: 'user', text: 'menu?' });
  const recent = store.getRecentMessages('t1', 'c1', 2);
  assert.deepEqual(recent, [
    { role: 'assistant', text: 'hello' },
    { role: 'user', text: 'menu?' },
  ]);
  store.close();
});

test('messages are isolated per conversation', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addMessage({ tenantId: 't1', conversationId: 'c1', role: 'user', text: 'from c1' });
  store.addMessage({ tenantId: 't1', conversationId: 'c2', role: 'user', text: 'from c2' });
  const c1 = store.getRecentMessages('t1', 'c1', 10);
  assert.deepEqual(c1, [{ role: 'user', text: 'from c1' }]);
  store.close();
});

test('adds and lists documents for a tenant, oldest first', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'menu.md_1', tenantId: 't1', filename: 'menu.md', chunkCount: 3 });
  store.addDocument({ id: 'info.md_2', tenantId: 't1', filename: 'info.md', chunkCount: 1 });

  const docs = store.listDocuments('t1');

  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.id), ['menu.md_1', 'info.md_2']);
  assert.equal(docs[0].filename, 'menu.md');
  assert.equal(docs[0].chunkCount, 3);
  assert.ok(docs[0].createdAt);
  store.close();
});

test('listDocuments only returns documents for the requested tenant', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.createTenant({ id: 't2', name: 'B', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'a.md', chunkCount: 1 });
  store.addDocument({ id: 'doc2', tenantId: 't2', filename: 'b.md', chunkCount: 1 });

  assert.deepEqual(store.listDocuments('t1').map((d) => d.id), ['doc1']);
  assert.deepEqual(store.listDocuments('t2').map((d) => d.id), ['doc2']);
  store.close();
});

test('getDocument returns the document with its tenantId, or null if missing', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'a.md', chunkCount: 2 });

  const doc = store.getDocument('doc1');
  assert.equal(doc.tenantId, 't1');
  assert.equal(doc.filename, 'a.md');
  assert.equal(store.getDocument('missing'), null);
  store.close();
});

test('addDocument stores the mimetype, retrievable via getDocument and listDocuments', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'menu.pdf', chunkCount: 3, mimetype: 'application/pdf' });

  assert.equal(store.getDocument('doc1').mimetype, 'application/pdf');
  assert.equal(store.listDocuments('t1')[0].mimetype, 'application/pdf');
  store.close();
});

test('opening a database created before the mimetype column existed migrates it automatically', () => {
  const Database = require('better-sqlite3');
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-migration-test-')), 'tenants.db');
  const rawDb = new Database(dbPath);
  rawDb.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      chunk_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  rawDb.close();

  const store = new TenantStore(dbPath);
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'menu.pdf', chunkCount: 3, mimetype: 'application/pdf' });

  assert.equal(store.getDocument('doc1').mimetype, 'application/pdf');
  store.close();
});

test('addDocument defaults mimetype to an empty string when omitted', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'a.md', chunkCount: 1 });

  assert.equal(store.getDocument('doc1').mimetype, '');
  store.close();
});

test('deleteDocument removes the document row', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'a.md', chunkCount: 1 });

  store.deleteDocument('doc1');

  assert.equal(store.getDocument('doc1'), null);
  assert.deepEqual(store.listDocuments('t1'), []);
  store.close();
});
