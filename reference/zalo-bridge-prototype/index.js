'use strict';

const path = require('node:path');
const { ThreadType } = require('zca-js');
const { createZaloApi } = require('./src/zalo-session');
const { ThreadStore } = require('./src/store');
const { BackendClient } = require('./src/backend-client');
const { handleIncomingMessage, shouldHandleMessage } = require('./src/message-handler');

async function main() {
  const baseUrl = process.env.BACKEND_BASE_URL;
  const serviceApiKey = process.env.ZALO_BRIDGE_SERVICE_API_KEY;
  const agentName = process.env.AGENT_NAME;
  if (!baseUrl || !serviceApiKey || !agentName) {
    throw new Error('BACKEND_BASE_URL, ZALO_BRIDGE_SERVICE_API_KEY and AGENT_NAME env vars are required');
  }

  const store = new ThreadStore(process.env.SQLITE_PATH || path.join(__dirname, 'data', 'mappings.db'));
  const backendClient = new BackendClient({ baseUrl, serviceApiKey, agentName });
  const api = await createZaloApi({
    credentialsPath: process.env.ZALO_CREDENTIALS_PATH || path.join(__dirname, 'data', 'credentials.json'),
  });
  const ownUid = api.getOwnId();

  api.listener.on('message', async (message) => {
    try {
      if (!shouldHandleMessage(message, ThreadType, ownUid)) return;
      // DMs get a private reply; group replies go back into the same group
      // (shouldHandleMessage already filtered groups down to @-mentions of the bot).
      const conversationId = message.type === ThreadType.Group ? message.threadId : message.data.uidFrom;
      await handleIncomingMessage({
        store,
        backendClient,
        sendReply: (id, text) => api.sendMessage(text, id, message.type),
        zaloUserId: conversationId,
        text: message.data.content,
      });
    } catch (err) {
      console.error('zalo-bridge: unhandled error in message listener', err);
    }
  });

  api.listener.on('error', (err) => {
    console.error('zalo-bridge: listener error', err);
  });

  api.listener.start();
  console.log('zalo-bridge: listening for messages');
}

main().catch((err) => {
  console.error('zalo-bridge: fatal startup error', err);
  process.exit(1);
});
