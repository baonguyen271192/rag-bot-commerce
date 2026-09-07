'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Zalo } = require('zca-js');

async function createZaloApi({ credentialsPath, qrPath, logger = console, onStatusChange = () => {} }) {
  fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
  fs.mkdirSync(path.dirname(qrPath), { recursive: true });

  const zalo = new Zalo();
  let credentials = null;
  if (fs.existsSync(credentialsPath)) {
    credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  }

  let api;
  if (credentials) {
    logger.info('bridge: logging in with saved credentials');
    api = await zalo.login(credentials);
  } else {
    logger.info('bridge: no saved credentials, scan the QR code to log in');
    onStatusChange({ status: 'awaiting_qr' });
    api = await zalo.loginQR({ qrPath }, async (event) => {
      switch (event.type) {
        case 0: // QRCodeGenerated
          await event.actions.saveToFile(qrPath);
          onStatusChange({ status: 'awaiting_qr', qrPath });
          logger.info(`bridge: QR code written to ${qrPath}, scan it with the restaurant's Zalo app`);
          break;
        case 1: // QRCodeExpired
          logger.info('bridge: QR code expired, generating a new one');
          event.actions.retry();
          break;
        case 2: // QRCodeScanned
          logger.info('bridge: QR code scanned, confirm login on your phone');
          break;
        case 3: // QRCodeDeclined
          onStatusChange({ status: 'error', error: 'login declined on phone' });
          logger.info('bridge: login declined on phone');
          break;
      }
    });
    const context = api.getContext();
    const toSave = {
      imei: context.imei,
      userAgent: context.userAgent,
      cookie: context.cookie.toJSON()?.cookies,
    };
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    fs.writeFileSync(credentialsPath, JSON.stringify(toSave, null, 2));
    logger.info(`bridge: credentials saved to ${credentialsPath}`);
  }

  return api;
}

module.exports = { createZaloApi };
