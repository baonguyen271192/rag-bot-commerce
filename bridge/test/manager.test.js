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
