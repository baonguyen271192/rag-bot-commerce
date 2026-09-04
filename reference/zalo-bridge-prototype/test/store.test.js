'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ThreadStore } = require('../src/store');

test('returns null for an unknown zalo user', () => {
  const store = new ThreadStore(':memory:');
  assert.equal(store.getThreadId('unknown-user'), null);
  store.close();
});

test('saves and retrieves a thread id for a zalo user', () => {
  const store = new ThreadStore(':memory:');
  store.saveThreadId('zalo-123', 'T-abc');
  assert.equal(store.getThreadId('zalo-123'), 'T-abc');
  store.close();
});

test('each zalo user keeps its own thread id', () => {
  const store = new ThreadStore(':memory:');
  store.saveThreadId('zalo-1', 'T-1');
  store.saveThreadId('zalo-2', 'T-2');
  assert.equal(store.getThreadId('zalo-1'), 'T-1');
  assert.equal(store.getThreadId('zalo-2'), 'T-2');
  store.close();
});

test('updates thread id when saving for an existing zalo user', () => {
  const store = new ThreadStore(':memory:');
  store.saveThreadId('zalo-123', 'T-abc');
  assert.equal(store.getThreadId('zalo-123'), 'T-abc');
  store.saveThreadId('zalo-123', 'T-xyz');
  assert.equal(store.getThreadId('zalo-123'), 'T-xyz');
  store.close();
});
