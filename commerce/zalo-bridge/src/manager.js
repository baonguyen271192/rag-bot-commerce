'use strict';

const path = require('node:path');
const { ThreadType } = require('zca-js');
const { startTenantSession } = require('./tenant-session');

async function startAllTenantSessions({
  commerceClient,
  dataDir,
  statusRegistry,
  sessionHandles,
  logger = console,
  startTenantSessionImpl = startTenantSession,
}) {
  const tenants = await commerceClient.listTenants();

  await Promise.all(
    tenants.map(async (tenant) => {
      try {
        await startTenantSessionImpl({
          tenantId: tenant.id,
          commerceClient,
          credentialsPath: path.join(dataDir, tenant.id, 'credentials.json'),
          qrPath: path.join(dataDir, tenant.id, 'qr.png'),
          onStatusChange: (status) => statusRegistry.set(tenant.id, status),
          ThreadType,
          logger,
          onSessionReady: (handle) => {
            if (sessionHandles) sessionHandles.set(tenant.id, { logout: handle.logout });
          },
        });
      } catch (err) {
        logger.error(`zalo-bridge: tenant ${tenant.id} failed to start`, err);
        statusRegistry.set(tenant.id, { status: 'error', error: err.message });
      }
    })
  );
}

module.exports = { startAllTenantSessions };
