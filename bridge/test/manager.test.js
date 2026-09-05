'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startAllTenantSessions } = require('../src/manager');

test('starts one session per tenant returned by the backend', async () => {
  const backendClient = { listTenants: async () => [{ id: 't1' }, { id: 't2' }] };
  const started = [];
  const statusRegistry = new Map();

  await startAllTenantSessions({
    backendClient,
    dataDir: '/tmp/bridge-data',
    statusRegistry,
    logger: { info: () => {}, error: () => {} },
    startTenantSessionImpl: async (opts) => {
      started.push(opts.tenantId);
    },
  });

  assert.deepEqual(started.sort(), ['t1', 't2']);
});

test('one tenant failing to start does not prevent others from starting', async () => {
  const backendClient = { listTenants: async () => [{ id: 'broken' }, { id: 'ok' }] };
  const started = [];
  const statusRegistry = new Map();

  await startAllTenantSessions({
    backendClient,
    dataDir: '/tmp/bridge-data',
    statusRegistry,
    logger: { info: () => {}, error: () => {} },
    startTenantSessionImpl: async (opts) => {
      if (opts.tenantId === 'broken') throw new Error('login declined');
      started.push(opts.tenantId);
    },
  });

  assert.deepEqual(started, ['ok']);
  assert.equal(statusRegistry.get('broken').status, 'error');
  assert.match(statusRegistry.get('broken').error, /login declined/);
});

test('derives per-tenant credentials and qr paths from dataDir', async () => {
  const backendClient = { listTenants: async () => [{ id: 't1' }] };
  let capturedOpts;
  const statusRegistry = new Map();

  await startAllTenantSessions({
    backendClient,
    dataDir: '/data/bridge',
    statusRegistry,
    logger: { info: () => {}, error: () => {} },
    startTenantSessionImpl: async (opts) => {
      capturedOpts = opts;
    },
  });

  assert.equal(capturedOpts.credentialsPath, '/data/bridge/t1/credentials.json');
  assert.equal(capturedOpts.qrPath, '/data/bridge/t1/qr.png');
});

test('starts all tenant sessions concurrently, not sequentially', async () => {
  // t1's fake session blocks until t2's fake session has already started. Under a
  // sequential implementation (e.g. a `for...of` loop with `await` per tenant),
  // t2 would never get a chance to run before t1 finishes, and this test would
  // hang/timeout. Under the real concurrent `Promise.all(tenants.map(...))`
  // implementation, t2 starts immediately (in the same synchronous pass over the
  // array) and unblocks t1, so this resolves quickly.
  const backendClient = { listTenants: async () => [{ id: 't1' }, { id: 't2' }] };
  const entered = [];
  let resolveT1Gate;
  const t1Gate = new Promise((resolve) => {
    resolveT1Gate = resolve;
  });

  await startAllTenantSessions({
    backendClient,
    dataDir: '/tmp/bridge-data',
    statusRegistry: new Map(),
    logger: { info: () => {}, error: () => {} },
    startTenantSessionImpl: async (opts) => {
      entered.push(opts.tenantId);
      if (opts.tenantId === 't1') {
        await t1Gate;
      } else {
        resolveT1Gate();
      }
    },
  });

  assert.deepEqual(entered.sort(), ['t1', 't2']);
});
