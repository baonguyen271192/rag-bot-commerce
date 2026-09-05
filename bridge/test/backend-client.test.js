'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BackendClient } = require('../src/backend-client');

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

test('listTenants GETs /tenants and returns the parsed list', async () => {
  const calls = [];
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => [{ id: 't1', name: 'A' }] };
    }),
  });

  const tenants = await client.listTenants();

  assert.equal(calls[0].url, 'http://backend.local/tenants');
  assert.deepEqual(tenants, [{ id: 't1', name: 'A' }]);
});

test('listTenants throws a clear error on a non-ok response', async () => {
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 500 })),
  });

  await assert.rejects(() => client.listTenants(), /listTenants failed with status 500/);
});

test('ask POSTs conversationId, text, and image to /tenants/:id/ask and returns the reply', async () => {
  const calls = [];
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ reply: 'Chao ban!' }) };
    }),
  });

  const reply = await client.ask('t1', { conversationId: 'c1', text: 'hi', image: 'data:image/png;base64,AAA=' });

  assert.equal(reply, 'Chao ban!');
  assert.equal(calls[0].url, 'http://backend.local/tenants/t1/ask');
  assert.equal(calls[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].opts.body), {
    conversationId: 'c1',
    text: 'hi',
    image: 'data:image/png;base64,AAA=',
  });
});

test('ask omits image from the request body when not provided', async () => {
  const calls = [];
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ reply: 'ok' }) };
    }),
  });

  await client.ask('t1', { conversationId: 'c1', text: 'hi' });

  // JSON.stringify drops keys whose value is undefined, so the parsed body has no `image` key at all.
  assert.deepEqual(JSON.parse(calls[0].opts.body), { conversationId: 'c1', text: 'hi' });
});

test('ask throws a clear error on a non-ok response', async () => {
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 404 })),
  });

  await assert.rejects(() => client.ask('missing', { conversationId: 'c1', text: 'hi' }), /ask failed with status 404/);
});
