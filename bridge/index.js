'use strict';

const path = require('node:path');
const { BackendClient } = require('./src/backend-client');
const { startAllTenantSessions } = require('./src/manager');
const { createStatusServer } = require('./src/status-server');

async function main() {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error('BACKEND_URL env var is required');
  }

  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const statusPort = process.env.STATUS_PORT || 4002;

  const backendClient = new BackendClient({ baseUrl: backendUrl });
  const statusRegistry = new Map();
  const sessionHandles = new Map();

  const statusApp = createStatusServer({ statusRegistry, dataDir, sessionHandles });
  statusApp.listen(statusPort, () => {
    console.log(`bridge: status server listening on port ${statusPort}`);
  });

  await startAllTenantSessions({ backendClient, dataDir, statusRegistry, sessionHandles });
  console.log('bridge: all tenant sessions started (see logs above for per-tenant status)');
}

main().catch((err) => {
  console.error('bridge: fatal startup error', err);
  process.exit(1);
});
