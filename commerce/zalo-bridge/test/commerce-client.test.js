'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CommerceClient } = require('../src/commerce-client');

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

// ---------------- Đường chạy thuận lợi ----------------

test('listTenants GETs /api/admin/stores and keeps only stores with zalo_enabled === true', async () => {
  const calls = [];
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => [
          { id: 'a', zalo_enabled: true },
          { id: 'b', zalo_enabled: false },
          { id: 'c', zalo_enabled: true },
        ],
      };
    }),
  });

  const tenants = await client.listTenants();

  assert.equal(calls[0].url, 'http://commerce.local/api/admin/stores');
  assert.deepEqual(tenants, [{ id: 'a' }, { id: 'c' }]);
});

test('askCommerce POSTs store_id/sender_id/text to /channels/zalo/message and returns sends', async () => {
  const calls = [];
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ sends: [{ text: 'hi', image_url: null }] }) };
    }),
  });

  const result = await client.askCommerce('store1', { senderId: 'u1', text: 'hello' });

  assert.equal(calls[0].url, 'http://commerce.local/channels/zalo/message');
  assert.equal(calls[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { store_id: 'store1', sender_id: 'u1', text: 'hello' });
  assert.deepEqual(result, { sends: [{ text: 'hi', image_url: null }] });
});

test('downloadImageByUrl fetches the URL and returns {data: Buffer, contentType}', async () => {
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })),
  });

  const result = await client.downloadImageByUrl('http://img/2.png');

  assert.deepEqual(result.data, Buffer.from([1, 2, 3]));
  assert.equal(result.contentType, 'image/png');
});

// ---------------- Trường hợp biên (kế hoạch câu 11 — auth 2 chiều) ----------------

test('_headers adds X-Bridge-Secret when a secret is configured', async () => {
  let seenHeaders;
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    bridgeSecret: 'sek',
    fetchImpl: fakeFetch(async (url, opts) => {
      seenHeaders = opts.headers;
      return { ok: true, json: async () => [] };
    }),
  });

  await client.listTenants();

  assert.equal(seenHeaders['X-Bridge-Secret'], 'sek');
});

test('_headers omits X-Bridge-Secret when no secret is configured (default, optional per câu 11)', async () => {
  let seenHeaders;
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async (url, opts) => {
      seenHeaders = opts.headers;
      return { ok: true, json: async () => [] };
    }),
  });

  await client.listTenants();

  assert.equal('X-Bridge-Secret' in seenHeaders, false);
});

test('askCommerce returns an empty sends[] (not undefined/throw) when commerce omits the key', async () => {
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async () => ({ ok: true, json: async () => ({}) })),
  });

  const result = await client.askCommerce('store1', { senderId: 'u1', text: 'hello' });

  assert.deepEqual(result, { sends: [] });
});

// ---------------- Đầu vào sai / lỗi phải thất bại đúng cách ----------------

test('listTenants throws a clear error on a non-ok response (commerce down/misbehaving)', async () => {
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 500 })),
  });

  await assert.rejects(() => client.listTenants(), /listTenants failed with status 500/);
});

test('askCommerce throws a clear error on a non-ok response (e.g. store 404 vì chưa bật zalo_enabled)', async () => {
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 404 })),
  });

  await assert.rejects(() => client.askCommerce('store1', { senderId: 'u1', text: 'hi' }), /askCommerce failed with status 404/);
});

test('downloadImageByUrl throws a clear error on a non-ok response (ảnh sản phẩm hỏng/404)', async () => {
  const client = new CommerceClient({
    baseUrl: 'http://commerce.local',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 404 })),
  });

  await assert.rejects(() => client.downloadImageByUrl('http://img/missing.png'), /downloadImageByUrl failed with status 404/);
});
