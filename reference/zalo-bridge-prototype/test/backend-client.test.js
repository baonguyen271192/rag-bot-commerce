'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BackendClient, parseSSE, aggregateSSE } = require('../src/backend-client');

const SAMPLE_STREAM = [
  'event: message/full',
  'data: {"content":{"thread_id":"T-1","run_id":"R-1","role":"user","payload":{"text":"xin chao"},"id":1,"created_at":"2026-09-03T00:00:00Z","updated_at":"2026-09-03T00:00:00Z"},"event":"message/full"}',
  '',
  '',
  'event: text/delta',
  'data: {"content":"Chao ","event":"text/delta"}',
  '',
  '',
  'event: text/delta',
  'data: {"content":"ban!","event":"text/delta"}',
  '',
  '',
  'event: message/full',
  'data: {"content":{"thread_id":"T-1","run_id":"R-1","role":"assistant","payload":{"text":"Chao ban!"},"id":2,"created_at":"2026-09-03T00:00:01Z","updated_at":"2026-09-03T00:00:01Z"},"event":"message/full"}',
  '',
  '',
  'event: status',
  'data: {"content":"ready","event":"status"}',
  '',
  '',
].join('\n');

test('parseSSE extracts event/data pairs from the wire format', () => {
  const events = parseSSE(SAMPLE_STREAM);
  assert.equal(events.length, 5);
  assert.equal(events[0].event, 'message/full');
  assert.equal(events[0].data.content.role, 'user');
});

test('aggregateSSE returns the assistant message/full text when present', () => {
  assert.equal(aggregateSSE(SAMPLE_STREAM), 'Chao ban!');
});

test('aggregateSSE falls back to concatenated text/delta when no assistant message/full exists', () => {
  const deltaOnly = [
    'event: text/delta',
    'data: {"content":"Chao ","event":"text/delta"}',
    '',
    '',
    'event: text/delta',
    'data: {"content":"ban!","event":"text/delta"}',
    '',
    '',
  ].join('\n');
  assert.equal(aggregateSSE(deltaOnly), 'Chao ban!');
});

test('aggregateSSE returns null when the stream has no usable content', () => {
  const empty = ['event: status', 'data: {"content":"ready","event":"status"}', '', ''].join('\n');
  assert.equal(aggregateSSE(empty), null);
});

test('createThread posts to /api/v1/threads with the service api key header and returns the thread id', async () => {
  let capturedUrl;
  let capturedInit;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return { ok: true, json: async () => ({ id: 'T-42' }) };
  };
  const client = new BackendClient({
    baseUrl: 'http://backend:8000',
    serviceApiKey: 'test-key',
    agentName: 'QMSAssistant',
    fetchImpl: fakeFetch,
  });

  const threadId = await client.createThread();

  assert.equal(threadId, 'T-42');
  assert.equal(capturedUrl, 'http://backend:8000/api/v1/threads');
  assert.equal(capturedInit.headers['X-Service-Api-Key'], 'test-key');
});

test('runSync posts text+agent_name and aggregates the SSE response', async () => {
  const fakeFetch = async () => ({ ok: true, text: async () => SAMPLE_STREAM });
  const client = new BackendClient({
    baseUrl: 'http://backend:8000',
    serviceApiKey: 'test-key',
    agentName: 'QMSAssistant',
    fetchImpl: fakeFetch,
  });

  const reply = await client.runSync('T-1', 'xin chao');

  assert.equal(reply, 'Chao ban!');
});

test('createThread throws when the backend responds with an error status', async () => {
  const fakeFetch = async () => ({ ok: false, status: 500 });
  const client = new BackendClient({
    baseUrl: 'http://backend:8000',
    serviceApiKey: 'test-key',
    agentName: 'QMSAssistant',
    fetchImpl: fakeFetch,
  });

  await assert.rejects(() => client.createThread(), /500/);
});
