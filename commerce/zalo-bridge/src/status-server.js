'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');

function createStatusServer({ statusRegistry, dataDir, sessionHandles }) {
  const app = express();
  app.use(cors());

  app.get('/sessions', (req, res) => {
    const sessions = Array.from(statusRegistry.entries()).map(([tenantId, status]) => ({ tenantId, ...status }));
    res.json(sessions);
  });

  app.get('/tenants/:id/qr-status', (req, res) => {
    const status = statusRegistry.get(req.params.id);
    if (!status) return res.status(404).json({ error: 'tenant not found' });
    if (status.status === 'awaiting_qr' && status.qrPath) {
      // qrVersion is the QR file's own last-modified time, not Date.now() -- it only
      // changes when bridge actually writes a new QR code (initial generation, or a
      // regeneration after expiry), so the admin-ui only reloads the image then, not on
      // every 3s status poll.
      let qrVersion = null;
      try {
        qrVersion = fs.statSync(status.qrPath).mtimeMs;
      } catch {
        // file briefly missing between statusRegistry update and disk write -- next poll picks it up
      }
      return res.json({ status: status.status, qrUrl: `/tenants/${req.params.id}/qr.png`, qrVersion });
    }
    if (status.status === 'error') {
      return res.json({ status: status.status, error: status.error });
    }
    res.json({ status: status.status });
  });

  app.post('/tenants/:id/logout', (req, res) => {
    const handle = sessionHandles && sessionHandles.get(req.params.id);
    if (!handle) return res.status(404).json({ error: 'tenant not connected' });
    handle.logout();
    res.json({ ok: true });
  });

  app.get('/tenants/:id/qr.png', (req, res) => {
    if (!/^[a-z0-9-]+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'invalid tenant id' });
    }
    const qrPath = path.join(dataDir, req.params.id, 'qr.png');
    if (!fs.existsSync(qrPath)) return res.status(404).json({ error: 'no qr code available' });
    res.sendFile(qrPath);
  });

  return app;
}

module.exports = { createStatusServer };
