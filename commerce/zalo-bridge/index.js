'use strict';

const path = require('node:path');
const { CommerceClient } = require('./src/commerce-client');
const { startAllTenantSessions } = require('./src/manager');
const { createStatusServer } = require('./src/status-server');

async function main() {
  const commerceUrl = process.env.COMMERCE_URL;
  if (!commerceUrl) {
    throw new Error('COMMERCE_URL env var is required');
  }

  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const statusPort = process.env.STATUS_PORT || 4102;
  const bridgeSecret = process.env.ZALO_BRIDGE_SECRET || '';

  const commerceClient = new CommerceClient({ baseUrl: commerceUrl, bridgeSecret });
  const statusRegistry = new Map();
  const sessionHandles = new Map();

  const statusApp = createStatusServer({ statusRegistry, dataDir, sessionHandles });
  statusApp.listen(statusPort, () => {
    console.log(`zalo-bridge: status server listening on port ${statusPort}`);
  });

  await startAllTenantSessions({ commerceClient, dataDir, statusRegistry, sessionHandles });
  console.log('zalo-bridge: all tenant sessions started (see logs above for per-tenant status)');
}

main().catch((err) => {
  console.error('zalo-bridge: fatal startup error', err);
  process.exit(1);
});
