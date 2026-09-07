'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmbeddingClient, GeminiEmbeddingClient } = require('../src/embeddings');

test('embed posts to the OpenAI embeddings endpoint with the configured model and returns vectors in order', async () => {
  let capturedUrl;
  let capturedBody;
  let capturedHeaders;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    capturedHeaders = init.headers;
    return {
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [0.1, 0.2] },
          { index: 1, embedding: [0.3, 0.4] },
        ],
      }),
    };
  };
  const client = new EmbeddingClient({ apiKey: 'test-key', fetchImpl: fakeFetch });

  const vectors = await client.embed(['hello', 'world']);

  assert.equal(capturedUrl, 'https://api.openai.com/v1/embeddings');
  assert.equal(capturedHeaders.Authorization, 'Bearer test-key');
  assert.deepEqual(capturedBody, { model: 'text-embedding-3-small', input: ['hello', 'world'] });
  assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
});

test('embed returns vectors sorted by the index field, not response array order', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { index: 1, embedding: [9, 9] },
        { index: 0, embedding: [1, 1] },
      ],
    }),
  });
  const client = new EmbeddingClient({ apiKey: 'k', fetchImpl: fakeFetch });
  const vectors = await client.embed(['a', 'b']);
  assert.deepEqual(vectors, [[1, 1], [9, 9]]);
});

test('embed throws a clear error when the API responds with a non-ok status', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid api key' });
  const client = new EmbeddingClient({ apiKey: 'bad-key', fetchImpl: fakeFetch });
  await assert.rejects(() => client.embed(['x']), /401/);
});

test('embed returns an empty array for empty input without calling fetch', async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return { ok: true, json: async () => ({ data: [] }) };
  };
  const client = new EmbeddingClient({ apiKey: 'k', fetchImpl: fakeFetch });
  const vectors = await client.embed([]);
  assert.deepEqual(vectors, []);
  assert.equal(called, false);
});

test('GeminiEmbeddingClient.embed posts to the batchEmbedContents endpoint with the configured model and returns vectors in order', async () => {
  let capturedUrl;
  let capturedBody;
  let capturedHeaders;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    capturedHeaders = init.headers;
    return {
      ok: true,
      json: async () => ({
        embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
      }),
    };
  };
  const client = new GeminiEmbeddingClient({ apiKey: 'test-key', fetchImpl: fakeFetch });

  const vectors = await client.embed(['hello', 'world']);

  assert.equal(
    capturedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents'
  );
  assert.equal(capturedHeaders['x-goog-api-key'], 'test-key');
  assert.deepEqual(capturedBody, {
    requests: [
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'hello' }] } },
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'world' }] } },
    ],
  });
  assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
});

test('GeminiEmbeddingClient.embed preserves response order as returned by the API (no re-sorting needed)', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ embeddings: [{ values: [1, 1] }, { values: [9, 9] }] }),
  });
  const client = new GeminiEmbeddingClient({ apiKey: 'k', fetchImpl: fakeFetch });
  const vectors = await client.embed(['a', 'b']);
  assert.deepEqual(vectors, [[1, 1], [9, 9]]);
});

test('GeminiEmbeddingClient.embed throws a clear error when the API responds with a non-ok status', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid api key' });
  const client = new GeminiEmbeddingClient({ apiKey: 'bad-key', fetchImpl: fakeFetch });
  await assert.rejects(() => client.embed(['x']), /401/);
});

test('GeminiEmbeddingClient.embed returns an empty array for empty input without calling fetch', async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return { ok: true, json: async () => ({ embeddings: [] }) };
  };
  const client = new GeminiEmbeddingClient({ apiKey: 'k', fetchImpl: fakeFetch });
  const vectors = await client.embed([]);
  assert.deepEqual(vectors, []);
  assert.equal(called, false);
});

test('GeminiEmbeddingClient.embed uses the configured model override', async () => {
  let capturedUrl;
  let capturedBody;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ embeddings: [{ values: [1] }] }) };
  };
  const client = new GeminiEmbeddingClient({ apiKey: 'k', model: 'gemini-embedding-2', fetchImpl: fakeFetch });
  await client.embed(['x']);
  assert.equal(
    capturedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents'
  );
  assert.equal(capturedBody.requests[0].model, 'models/gemini-embedding-2');
});
