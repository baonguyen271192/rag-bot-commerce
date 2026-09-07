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

test('responses include a permissive CORS header for admin-ui', async () => {
  const app = createStatusServer({ statusRegistry: new Map(), dataDir: makeDataDir() });
  const res = await request(app).get('/sessions');
  assert.ok(res.headers['access-control-allow-origin']);
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

test('GET /tenants/:id/qr-status returns a qrUrl and the qr file\'s version when awaiting a scan', async () => {
  const dataDir = makeDataDir();
  const qrPath = path.join(dataDir, 't1', 'qr.png');
  fs.mkdirSync(path.dirname(qrPath), { recursive: true });
  fs.writeFileSync(qrPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const statusRegistry = new Map([['t1', { status: 'awaiting_qr', qrPath }]]);
  const app = createStatusServer({ statusRegistry, dataDir });

  const res = await request(app).get('/tenants/t1/qr-status');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'awaiting_qr');
  assert.equal(res.body.qrUrl, '/tenants/t1/qr.png');
  assert.equal(typeof res.body.qrVersion, 'number');
});

test('GET /tenants/:id/qr-status returns the same qrVersion across repeated polls when the qr file has not changed', async () => {
  const dataDir = makeDataDir();
  const qrPath = path.join(dataDir, 't1', 'qr.png');
  fs.mkdirSync(path.dirname(qrPath), { recursive: true });
  fs.writeFileSync(qrPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const statusRegistry = new Map([['t1', { status: 'awaiting_qr', qrPath }]]);
  const app = createStatusServer({ statusRegistry, dataDir });

  const first = await request(app).get('/tenants/t1/qr-status');
  const second = await request(app).get('/tenants/t1/qr-status');

  assert.equal(first.body.qrVersion, second.body.qrVersion);
});

test('GET /tenants/:id/qr-status includes the real error reason for an error status', async () => {
  const statusRegistry = new Map([['t1', { status: 'error', error: 'KICKOUT_BY_WORKER' }]]);
  const app = createStatusServer({ statusRegistry, dataDir: makeDataDir() });

  const res = await request(app).get('/tenants/t1/qr-status');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'error', error: 'KICKOUT_BY_WORKER' });
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

test('POST /tenants/:id/logout calls the tenant\'s logout handle', async () => {
  let logoutCalls = 0;
  const sessionHandles = new Map([['t1', { logout: () => { logoutCalls += 1; } }]]);
  const app = createStatusServer({ statusRegistry: new Map(), dataDir: makeDataDir(), sessionHandles });

  const res = await request(app).post('/tenants/t1/logout');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(logoutCalls, 1);
});

test('POST /tenants/:id/logout returns 404 for a tenant with no active session', async () => {
  const app = createStatusServer({ statusRegistry: new Map(), dataDir: makeDataDir(), sessionHandles: new Map() });
  const res = await request(app).post('/tenants/unknown/logout');
  assert.equal(res.status, 404);
});
