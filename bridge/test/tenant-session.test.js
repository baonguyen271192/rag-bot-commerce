'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTenantSession } = require('../src/tenant-session');

const ThreadType = { User: 0, Group: 1 };

function makeFakeApi({ ownUid = 'bot-uid' } = {}) {
  const handlers = {};
  const sentMessages = [];
  const api = {
    getOwnId: () => ownUid,
    sendMessage: async (text, threadId, type) => {
      sentMessages.push({ text, threadId, type });
    },
    listener: {
      on: (event, cb) => {
        handlers[event] = cb;
      },
      start: () => {},
    },
  };
  return { api, handlers, sentMessages };
}

test('startTenantSession replies in-place to a DM', async () => {
  const { api, handlers, sentMessages } = makeFakeApi();
  const askCalls = [];
  const backendClient = {
    ask: async (tenantId, args) => {
      askCalls.push({ tenantId, args });
      return 'Chao ban!';
    },
  };

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath: '/tmp/unused-creds.json',
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => api,
    ThreadType,
  });

  await handlers.message({ type: ThreadType.User, data: { content: 'xin chao', uidFrom: 'user-1' }, threadId: 'user-1' });

  assert.deepEqual(askCalls[0], { tenantId: 't1', args: { conversationId: 'user-1', text: 'xin chao', image: null } });
  assert.deepEqual(sentMessages, [{ text: 'Chao ban!', threadId: 'user-1', type: ThreadType.User }]);
});

test('startTenantSession replies into the group thread when mentioned', async () => {
  const { api, handlers, sentMessages } = makeFakeApi({ ownUid: 'bot-uid' });
  const backendClient = { ask: async () => 'ok' };

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath: '/tmp/unused-creds.json',
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => api,
    ThreadType,
  });

  await handlers.message({
    type: ThreadType.Group,
    data: { content: 'hi @bot', mentions: [{ uid: 'bot-uid', pos: 3, len: 4 }] },
    threadId: 'group-1',
  });

  assert.deepEqual(sentMessages, [{ text: 'ok', threadId: 'group-1', type: ThreadType.Group }]);
});

test('startTenantSession ignores group messages that do not mention the bot', async () => {
  const { api, handlers, sentMessages } = makeFakeApi();
  const backendClient = { ask: async () => 'should not be called' };

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath: '/tmp/unused-creds.json',
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => api,
    ThreadType,
  });

  await handlers.message({ type: ThreadType.Group, data: { content: 'hi everyone', mentions: [] }, threadId: 'group-1' });

  assert.deepEqual(sentMessages, []);
});

test('startTenantSession does not crash the process when the listener callback throws', async () => {
  const { api, handlers } = makeFakeApi();
  const backendClient = {
    ask: async () => {
      throw new Error('boom');
    },
  };

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath: '/tmp/unused-creds.json',
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => api,
    ThreadType,
    logger: { info: () => {}, error: () => {} },
  });

  // handleIncomingMessage already catches ask() errors internally and sends the
  // fallback message, so this must resolve without throwing.
  await handlers.message({ type: ThreadType.User, data: { content: 'hi', uidFrom: 'user-1' }, threadId: 'user-1' });
});

test('startTenantSession catches a synchronous throw in message filtering and does not crash', async () => {
  const { api, handlers } = makeFakeApi();
  const backendClient = { ask: async () => 'unused' };
  const logged = [];

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath: '/tmp/unused-creds.json',
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => api,
    ThreadType,
    logger: { info: () => {}, error: (...args) => logged.push(args) },
  });

  // message.data is missing entirely, so shouldHandleMessage's `message.data.content`
  // throws a TypeError synchronously inside the listener callback. Unlike the ask()-throws
  // test above, nothing in message-handler.js catches this — only tenant-session.js's own
  // outer try/catch can. This is the test that actually exercises that catch.
  await handlers.message({ type: ThreadType.User, threadId: 'user-1' });

  assert.ok(logged.length > 0);
});

test('startTenantSession reports status error when the Zalo session closes unexpectedly', async () => {
  const { api, handlers } = makeFakeApi();
  const statusUpdates = [];
  const backendClient = { ask: async () => 'unused' };

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath: '/tmp/unused-creds.json',
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: (status) => statusUpdates.push(status),
    createZaloApiImpl: async () => api,
    ThreadType,
    logger: { info: () => {}, error: () => {} },
  });

  handlers.closed(3003, 'kicked from another device');

  assert.deepEqual(statusUpdates[statusUpdates.length - 1], {
    status: 'error',
    error: 'kicked from another device',
  });
});
