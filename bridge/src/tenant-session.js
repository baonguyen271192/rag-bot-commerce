'use strict';

const { createZaloApi } = require('./zalo-session');
const { shouldHandleMessage, extractMessageContent, handleIncomingMessage } = require('./message-handler');

async function startTenantSession({
  tenantId,
  backendClient,
  credentialsPath,
  qrPath,
  onStatusChange,
  ThreadType,
  logger = console,
  createZaloApiImpl = createZaloApi,
}) {
  const api = await createZaloApiImpl({ credentialsPath, qrPath, logger, onStatusChange });
  const ownUid = api.getOwnId();
  onStatusChange({ status: 'logged_in' });

  api.listener.on('message', async (message) => {
    try {
      if (!shouldHandleMessage(message, ThreadType, ownUid)) return;
      const conversationId = message.type === ThreadType.Group ? message.threadId : message.data.uidFrom;
      const { text, image } = await extractMessageContent(message, { logger });
      await handleIncomingMessage({
        backendClient,
        tenantId,
        conversationId,
        text,
        image,
        sendReply: (replyText) => api.sendMessage(replyText, conversationId, message.type),
        logger,
      });
    } catch (err) {
      logger.error(`bridge: unhandled error in message listener for tenant ${tenantId}`, err);
    }
  });

  api.listener.on('error', (err) => {
    logger.error(`bridge: listener error for tenant ${tenantId}`, err);
  });

  api.listener.on('closed', (code, reason) => {
    logger.error(`bridge: session closed for tenant ${tenantId}`, { code, reason });
    onStatusChange({ status: 'error', error: reason || 'session closed' });
  });

  api.listener.start();
  logger.info(`bridge: tenant ${tenantId} listening for messages`);
  return api;
}

module.exports = { startTenantSession };
