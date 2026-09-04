'use strict';

const fs = require('node:fs');
const { Zalo } = require('zca-js');

async function createZaloApi({ credentialsPath, qrPath = './qr.png', logger = console }) {
  const zalo = new Zalo();
  let credentials = null;
  if (fs.existsSync(credentialsPath)) {
    credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  }

  let api;
  if (credentials) {
    logger.info('zalo-bridge: logging in with saved credentials');
    api = await zalo.login(credentials);
  } else {
    logger.info('zalo-bridge: no saved credentials, scan the QR code to log in');
    api = await zalo.loginQR({ qrPath }, async (event) => {
      switch (event.type) {
        case 0: // QRCodeGenerated
          await event.actions.saveToFile(qrPath);
          logger.info(`zalo-bridge: QR code written to ${qrPath}, scan it with the restaurant's Zalo app`);
          break;
        case 1: // QRCodeExpired
          logger.info('zalo-bridge: QR code expired, generating a new one');
          event.actions.retry();
          break;
        case 2: // QRCodeScanned
          logger.info('zalo-bridge: QR code scanned, confirm login on your phone');
          break;
        case 3: // QRCodeDeclined
          logger.info('zalo-bridge: login declined on phone');
          break;
      }
    });
    const context = api.getContext();
    const toSave = {
      imei: context.imei,
      userAgent: context.userAgent,
      cookie: context.cookie.toJSON()?.cookies,
    };
    fs.mkdirSync(require('node:path').dirname(credentialsPath), { recursive: true });
    fs.writeFileSync(credentialsPath, JSON.stringify(toSave, null, 2));
    logger.info(`zalo-bridge: credentials saved to ${credentialsPath}`);
  }

  return api;
}

module.exports = { createZaloApi };
