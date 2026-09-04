'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
