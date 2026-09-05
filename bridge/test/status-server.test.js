'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createStatusServer } = require('../src/status-server');

function makeDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-status-test-'));
}

test('GET /sessions lists every tenant currently in the registry', async () => {
  const statusRegistry = new Map([
    ['t1', { status: 'logged_in' }],
    ['t2', { status: 'awaiting_qr' }],
  ]);
  const app = createStatusServer({ statusRegistry, dataDir: makeDataDir() });

  const res = await request(app).get('/sessions');

  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.sort((a, b) => a.tenantId.localeCompare(b.tenantId)),
    [
      { tenantId: 't1', status: 'logged_in' },
      { tenantId: 't2', status: 'awaiting_qr' },
    ]
  );
});

test('GET /tenants/:id/qr-status returns 404 for an unknown tenant', async () => {
  const app = createStatusServer({ statusRegistry: new Map(), dataDir: makeDataDir() });
  const res = await request(app).get('/tenants/unknown/qr-status');
  assert.equal(res.status, 404);
});

test('GET /tenants/:id/qr-status returns just the status when logged in', async () => {
  const statusRegistry = new Map([['t1', { status: 'logged_in' }]]);
  const app = createStatusServer({ statusRegistry, dataDir: makeDataDir() });

  const res = await request(app).get('/tenants/t1/qr-status');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'logged_in' });
});

test('GET /tenants/:id/qr-status returns a qrUrl when awaiting a scan', async () => {
  const statusRegistry = new Map([['t1', { status: 'awaiting_qr', qrPath: '/data/t1/qr.png' }]]);
  const app = createStatusServer({ statusRegistry, dataDir: makeDataDir() });

  const res = await request(app).get('/tenants/t1/qr-status');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'awaiting_qr', qrUrl: '/tenants/t1/qr.png' });
});

test('GET /tenants/:id/qr.png serves the current QR file', async () => {
  const dataDir = makeDataDir();
  fs.mkdirSync(path.join(dataDir, 't1'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 't1', 'qr.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const app = createStatusServer({ statusRegistry: new Map(), dataDir });

  const res = await request(app).get('/tenants/t1/qr.png');

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
});

test('GET /tenants/:id/qr.png returns 404 when no QR file exists yet', async () => {
  const app = createStatusServer({ statusRegistry: new Map(), dataDir: makeDataDir() });
  const res = await request(app).get('/tenants/t1/qr.png');
  assert.equal(res.status, 404);
});

test('GET /tenants/:id/qr.png rejects a path-traversal id before touching the filesystem', async () => {
  const app = createStatusServer({ statusRegistry: new Map(), dataDir: makeDataDir() });
  const res = await request(app).get('/tenants/..%2f..%2f..%2fetc/qr.png');
  assert.equal(res.status, 400);
});
