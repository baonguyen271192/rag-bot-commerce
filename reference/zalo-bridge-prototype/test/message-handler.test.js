'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handleIncomingMessage, FALLBACK_MESSAGE, shouldHandleMessage } = require('../src/message-handler');

function makeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getThreadId: (zaloUserId) => map.get(zaloUserId) || null,
    saveThreadId: (zaloUserId, threadId) => map.set(zaloUserId, threadId),
  };
}

test('creates a new thread for a first-time zalo user and replies with the backend answer', async () => {
  const store = makeStore();
  const backendClient = {
    createThread: async () => 'T-new',
    runSync: async (threadId, text) => {
      assert.equal(threadId, 'T-new');
      assert.equal(text, 'xin chao');
      return 'Chao ban!';
    },
  };
  const sent = [];
  const sendReply = async (zaloUserId, text) => sent.push({ zaloUserId, text });

  await handleIncomingMessage({ store, backendClient, sendReply, zaloUserId: 'zalo-1', text: 'xin chao' });

  assert.equal(store.getThreadId('zalo-1'), 'T-new');
  assert.deepEqual(sent, [{ zaloUserId: 'zalo-1', text: 'Chao ban!' }]);
});

test('reuses the existing thread for a returning zalo user', async () => {
  const store = makeStore({ 'zalo-1': 'T-existing' });
  let createThreadCalled = false;
  const backendClient = {
    createThread: async () => {
      createThreadCalled = true;
      return 'T-should-not-be-used';
    },
    runSync: async (threadId) => {
      assert.equal(threadId, 'T-existing');
      return 'ok';
    },
  };
  const sendReply = async () => {};

  await handleIncomingMessage({ store, backendClient, sendReply, zaloUserId: 'zalo-1', text: 'hi again' });

  assert.equal(createThreadCalled, false);
});

test('sends the fallback message when the backend call throws', async () => {
  const store = makeStore({ 'zalo-1': 'T-existing' });
  const backendClient = {
    createThread: async () => 'T-new',
    runSync: async () => {
      throw new Error('backend unreachable');
    },
  };
  const sent = [];
  const sendReply = async (zaloUserId, text) => sent.push({ zaloUserId, text });

  await handleIncomingMessage({ store, backendClient, sendReply, zaloUserId: 'zalo-1', text: 'hi' });

  assert.deepEqual(sent, [{ zaloUserId: 'zalo-1', text: FALLBACK_MESSAGE }]);
});

test('sends the fallback message when the backend returns no usable text', async () => {
  const store = makeStore({ 'zalo-1': 'T-existing' });
  const backendClient = { createThread: async () => 'T-new', runSync: async () => null };
  const sent = [];
  const sendReply = async (zaloUserId, text) => sent.push({ zaloUserId, text });

  await handleIncomingMessage({ store, backendClient, sendReply, zaloUserId: 'zalo-1', text: 'hi' });

  assert.deepEqual(sent, [{ zaloUserId: 'zalo-1', text: FALLBACK_MESSAGE }]);
});

test('shouldHandleMessage accepts 1-1 text messages', () => {
  const ThreadType = { User: 0, Group: 1 };
  assert.equal(shouldHandleMessage({ type: 0, data: { content: 'hi' } }, ThreadType), true);
});

test('shouldHandleMessage rejects group messages that do not mention the bot', () => {
  const ThreadType = { User: 0, Group: 1 };
  assert.equal(
    shouldHandleMessage({ type: 1, data: { content: 'hi', mentions: [] } }, ThreadType, 'bot-uid'),
    false
  );
});

test('shouldHandleMessage rejects group messages with no mentions field at all', () => {
  const ThreadType = { User: 0, Group: 1 };
  assert.equal(shouldHandleMessage({ type: 1, data: { content: 'hi' } }, ThreadType, 'bot-uid'), false);
});

test('shouldHandleMessage accepts group messages that mention the bot', () => {
  const ThreadType = { User: 0, Group: 1 };
  const message = { type: 1, data: { content: 'hi @bot', mentions: [{ uid: 'bot-uid', pos: 3, len: 4 }] } };
  assert.equal(shouldHandleMessage(message, ThreadType, 'bot-uid'), true);
});

test('shouldHandleMessage rejects group messages that mention someone else', () => {
  const ThreadType = { User: 0, Group: 1 };
  const message = { type: 1, data: { content: 'hi @someone', mentions: [{ uid: 'someone-else', pos: 3, len: 8 }] } };
  assert.equal(shouldHandleMessage(message, ThreadType, 'bot-uid'), false);
});

test('shouldHandleMessage rejects non-text content', () => {
  const ThreadType = { User: 0, Group: 1 };
  assert.equal(shouldHandleMessage({ type: 0, data: { content: { attachment: true } } }, ThreadType), false);
});
