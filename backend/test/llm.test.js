'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LLMClient } = require('../src/llm');

test('complete posts system prompt + messages to OpenRouter and returns the reply text', async () => {
  let capturedUrl;
  let capturedBody;
  let capturedHeaders;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    capturedHeaders = init.headers;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Chao ban!' } }] }),
    };
  };
  const client = new LLMClient({ apiKey: 'test-key', fetchImpl: fakeFetch });

  const reply = await client.complete({
    systemPrompt: 'Ban la tro ly nha hang.',
    messages: [{ role: 'user', content: 'xin chao' }],
  });

  assert.equal(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(capturedHeaders.Authorization, 'Bearer test-key');
  assert.equal(capturedBody.model, 'minimax/minimax-m3:free');
  assert.deepEqual(capturedBody.messages, [
    { role: 'system', content: 'Ban la tro ly nha hang.' },
    { role: 'user', content: 'xin chao' },
  ]);
  assert.equal(reply, 'Chao ban!');
});

test('complete uses the configured model override', async () => {
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: `model=${body.model}` } }] }) };
  };
  const client = new LLMClient({ apiKey: 'k', model: 'qwen/qwen3.6-plus', fetchImpl: fakeFetch });
  const reply = await client.complete({ systemPrompt: 'p', messages: [] });
  assert.equal(reply, 'model=qwen/qwen3.6-plus');
});

test('complete throws a clear error on a non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 402, text: async () => 'insufficient credits' });
  const client = new LLMClient({ apiKey: 'k', fetchImpl: fakeFetch });
  await assert.rejects(() => client.complete({ systemPrompt: 'p', messages: [] }), /402/);
});

test('complete throws a clear error when the response has no choices', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ choices: [] }) });
  const client = new LLMClient({ apiKey: 'k', fetchImpl: fakeFetch });
  await assert.rejects(() => client.complete({ systemPrompt: 'p', messages: [] }), /no choices/i);
});
