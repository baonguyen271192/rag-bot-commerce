'use strict';

const path = require('node:path');
const { ThreadType } = require('zca-js');
const { startTenantSession } = require('./tenant-session');

async function startAllTenantSessions({
  backendClient,
  dataDir,
  statusRegistry,
  sessionHandles,
  logger = console,
  startTenantSessionImpl = startTenantSession,
}) {
  const tenants = await backendClient.listTenants();

  await Promise.all(
    tenants.map(async (tenant) => {
      try {
        const result = await startTenantSessionImpl({
          tenantId: tenant.id,
          backendClient,
          credentialsPath: path.join(dataDir, tenant.id, 'credentials.json'),
          qrPath: path.join(dataDir, tenant.id, 'qr.png'),
          onStatusChange: (status) => statusRegistry.set(tenant.id, status),
          ThreadType,
          logger,
        });
        if (sessionHandles && result && result.logout) {
          sessionHandles.set(tenant.id, { logout: result.logout });
        }
      } catch (err) {
        logger.error(`bridge: tenant ${tenant.id} failed to start`, err);
        statusRegistry.set(tenant.id, { status: 'error', error: err.message });
      }
    })
  );
}

module.exports = { startAllTenantSessions };
