'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

function createStatusServer({ statusRegistry, dataDir }) {
  const app = express();

  app.get('/sessions', (req, res) => {
    const sessions = Array.from(statusRegistry.entries()).map(([tenantId, status]) => ({ tenantId, ...status }));
    res.json(sessions);
  });

  app.get('/tenants/:id/qr-status', (req, res) => {
    const status = statusRegistry.get(req.params.id);
    if (!status) return res.status(404).json({ error: 'tenant not found' });
    if (status.status === 'awaiting_qr' && status.qrPath) {
      return res.json({ status: status.status, qrUrl: `/tenants/${req.params.id}/qr.png` });
    }
    res.json({ status: status.status });
  });

  app.get('/tenants/:id/qr.png', (req, res) => {
    const qrPath = path.join(dataDir, req.params.id, 'qr.png');
    if (!fs.existsSync(qrPath)) return res.status(404).json({ error: 'no qr code available' });
    res.sendFile(qrPath);
  });

  return app;
}

module.exports = { createStatusServer };
