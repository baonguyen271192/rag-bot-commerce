'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
      stop: () => {},
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
      return { reply: 'Chao ban!', attachments: [] };
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

test('startTenantSession sends the reply with the document image attached when the backend includes one', async () => {
  const { api, handlers, sentMessages } = makeFakeApi();
  const imageData = Buffer.from([1, 2, 3]);
  const backendClient = {
    ask: async () => ({
      reply: 'Com nieu gia 20.000d',
      attachments: [{ docId: 'menu.pdf_1', page: 3, mimetype: 'image/png' }],
    }),
    downloadDocumentImage: async () => ({ data: imageData, contentType: 'image/png' }),
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

  await handlers.message({ type: ThreadType.User, data: { content: 'com nieu gia bao nhieu', uidFrom: 'user-1' }, threadId: 'user-1' });

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].text, {
    msg: 'Com nieu gia 20.000d',
    attachments: [{ data: imageData, filename: 'menu-1.png', metadata: { totalSize: 3 } }],
  });
  assert.equal(sentMessages[0].threadId, 'user-1');
});

test('startTenantSession sends the reply with all document images attached when the backend includes several', async () => {
  const { api, handlers, sentMessages } = makeFakeApi();
  const page1 = Buffer.from([1]);
  const page2 = Buffer.from([2]);
  const backendClient = {
    ask: async () => ({
      reply: 'Duoi day la thuc don...',
      attachments: [
        { docId: 'menu.pdf_1', page: 1, mimetype: 'image/png' },
        { docId: 'menu.pdf_1', page: 2, mimetype: 'image/png' },
      ],
    }),
    downloadDocumentImage: async (tenantId, docId, page) => ({
      data: page === 1 ? page1 : page2,
      contentType: 'image/png',
    }),
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

  await handlers.message({ type: ThreadType.User, data: { content: 'menu', uidFrom: 'user-1' }, threadId: 'user-1' });

  assert.deepEqual(sentMessages[0].text, {
    msg: 'Duoi day la thuc don...',
    attachments: [
      { data: page1, filename: 'menu-1.png', metadata: { totalSize: 1 } },
      { data: page2, filename: 'menu-2.png', metadata: { totalSize: 1 } },
    ],
  });
});

test('startTenantSession replies into the group thread when mentioned', async () => {
  const { api, handlers, sentMessages } = makeFakeApi({ ownUid: 'bot-uid' });
  const backendClient = { ask: async () => ({ reply: 'ok', attachments: [] }) };

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
  const backendClient = { ask: async () => ({ reply: 'should not be called', attachments: [] }) };

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
  const backendClient = { ask: async () => ({ reply: 'unused', attachments: [] }) };
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
  const backendClient = { ask: async () => ({ reply: 'unused', attachments: [] }) };

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

test('startTenantSession removes stale credentials and restarts the login flow after the session closes', async () => {
  const credentialsPath = path.join(os.tmpdir(), `bridge-test-creds-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(credentialsPath, '{"stale":true}');
  const { api, handlers } = makeFakeApi();
  const statusUpdates = [];
  const backendClient = { ask: async () => ({ reply: 'unused', attachments: [] }) };
  let createCalls = 0;

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath,
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: (status) => statusUpdates.push(status),
    createZaloApiImpl: async () => {
      createCalls += 1;
      return api;
    },
    ThreadType,
    logger: { info: () => {}, error: () => {} },
  });

  handlers.closed(3003, 'KICKOUT_BY_WORKER');
  // Flush the recursive restart's pending microtasks (its own `await createZaloApiImpl(...)`).
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(createCalls, 2, 'createZaloApiImpl should be called again to restart the login flow');
  assert.equal(fs.existsSync(credentialsPath), false, 'the stale credentials file should be removed');
  assert.ok(
    statusUpdates.some((s) => s.status === 'error' && s.error === 'KICKOUT_BY_WORKER'),
    'the close reason should still be reported before the restart'
  );
});

test('startTenantSession does not throw when there are no credentials to remove on close', async () => {
  const credentialsPath = path.join(os.tmpdir(), `bridge-test-creds-missing-${Date.now()}-${Math.random()}.json`);
  const { api, handlers } = makeFakeApi();
  const backendClient = { ask: async () => ({ reply: 'unused', attachments: [] }) };

  await startTenantSession({
    tenantId: 't1',
    backendClient,
    credentialsPath,
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => api,
    ThreadType,
    logger: { info: () => {}, error: () => {} },
  });

  assert.doesNotThrow(() => handlers.closed(3003, 'kicked from another device'));
});

test('logout stops the listener, removes credentials, and restarts the login flow exactly once', async () => {
  const credentialsPath = path.join(os.tmpdir(), `bridge-test-creds-logout-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(credentialsPath, '{"stale":true}');
  const { api } = makeFakeApi();
  let stopCalls = 0;
  api.listener.stop = () => {
    stopCalls += 1;
  };
  let createCalls = 0;

  const { logout } = await startTenantSession({
    tenantId: 't1',
    backendClient: { ask: async () => ({ reply: 'unused', attachments: [] }) },
    credentialsPath,
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => {
      createCalls += 1;
      return api;
    },
    ThreadType,
    logger: { info: () => {}, error: () => {} },
  });

  logout();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(stopCalls, 1);
  assert.equal(createCalls, 2, 'createZaloApiImpl should be called again to restart the login flow');
  assert.equal(fs.existsSync(credentialsPath), false, 'the stale credentials file should be removed');

  // Calling logout() again (or a stray 'closed' event firing after stop()) must not
  // trigger a second restart.
  logout();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(createCalls, 2, 'a second logout call must not restart the session again');
});

test('onSessionReady fires again with a fresh logout handle after a restart, not the stale one', async () => {
  // Regression test: sessionHandles must not be left pointing at the first session's
  // logout(), whose `restarted` guard is already tripped and would silently no-op on a
  // second click of the operator's logout button.
  const credentialsPath = path.join(os.tmpdir(), `bridge-test-creds-ready-${Date.now()}-${Math.random()}.json`);
  const { api } = makeFakeApi();
  const readyHandles = [];

  await startTenantSession({
    tenantId: 't1',
    backendClient: { ask: async () => ({ reply: 'unused', attachments: [] }) },
    credentialsPath,
    qrPath: '/tmp/unused-qr.png',
    onStatusChange: () => {},
    createZaloApiImpl: async () => api,
    ThreadType,
    logger: { info: () => {}, error: () => {} },
    onSessionReady: (handle) => readyHandles.push(handle),
  });

  assert.equal(readyHandles.length, 1, 'onSessionReady should fire on the initial start');
  const [{ logout: firstLogout }] = readyHandles;

  firstLogout();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(readyHandles.length, 2, 'onSessionReady should fire again for the restarted session');
  const secondLogout = readyHandles[1].logout;
  assert.notEqual(secondLogout, firstLogout, 'the restarted session must hand out a new logout function');
});
