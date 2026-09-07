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

  const result = await client.ask('t1', { conversationId: 'c1', text: 'hi', image: 'data:image/png;base64,AAA=' });

  assert.deepEqual(result, { reply: 'Chao ban!', attachments: [] });
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

test('ask omits image from the request body when it is null (not just undefined)', async () => {
  // Real callers (message-handler.js's extractMessageContent) return `image: null`
  // for a text-only message, not `undefined`. JSON.stringify KEEPS a null value
  // (unlike undefined), so without this explicit check the backend would receive
  // `{"image":null}` and reject it — backend/'s /ask route treats any `image` that
  // isn't `undefined` as "present", and `IMAGE_DATA_URI_RE.test(null)` fails (null
  // stringifies to "null", which doesn't match the data-URI prefix), so it would
  // 400 on every single text-only message. This is exactly the bug this test guards.
  const calls = [];
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ reply: 'ok' }) };
    }),
  });

  await client.ask('t1', { conversationId: 'c1', text: 'hi', image: null });

  assert.deepEqual(JSON.parse(calls[0].opts.body), { conversationId: 'c1', text: 'hi' });
});

test('ask throws a clear error on a non-ok response', async () => {
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 404 })),
  });

  await assert.rejects(() => client.ask('missing', { conversationId: 'c1', text: 'hi' }), /ask failed with status 404/);
});

test('ask passes the attachments through when the backend includes some', async () => {
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async () => ({
      ok: true,
      json: async () => ({
        reply: 'Duoi day la thuc don...',
        attachments: [
          { docId: 'menu.pdf_1', page: 1, mimetype: 'image/png' },
          { docId: 'menu.pdf_1', page: 2, mimetype: 'image/png' },
        ],
      }),
    })),
  });

  const result = await client.ask('t1', { conversationId: 'c1', text: 'menu' });

  assert.deepEqual(result.attachments, [
    { docId: 'menu.pdf_1', page: 1, mimetype: 'image/png' },
    { docId: 'menu.pdf_1', page: 2, mimetype: 'image/png' },
  ]);
});

test('downloadDocumentImage GETs the tenant document image endpoint with the page query param', async () => {
  const calls = [];
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async (url) => {
      calls.push(url);
      return {
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    }),
  });

  const result = await client.downloadDocumentImage('t1', 'menu.pdf_1', 3);

  assert.equal(calls[0], 'http://backend.local/tenants/t1/documents/menu.pdf_1/image?page=3');
  assert.equal(result.contentType, 'image/png');
  assert.deepEqual(result.data, Buffer.from([1, 2, 3]));
});

test('downloadDocumentImage omits the page query param when not provided', async () => {
  const calls = [];
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async (url) => {
      calls.push(url);
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(0) };
    }),
  });

  await client.downloadDocumentImage('t1', 'menu.jpg_1', null);

  assert.equal(calls[0], 'http://backend.local/tenants/t1/documents/menu.jpg_1/image');
});

test('downloadDocumentImage throws a clear error on a non-ok response', async () => {
  const client = new BackendClient({
    baseUrl: 'http://backend.local',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 404 })),
  });

  await assert.rejects(
    () => client.downloadDocumentImage('t1', 'missing-doc', null),
    /downloadDocumentImage failed with status 404/
  );
});
