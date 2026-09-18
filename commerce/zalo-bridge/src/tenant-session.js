'use strict';

const fs = require('node:fs');
const { createZaloApi } = require('./zalo-session');
const { shouldHandleMessage, extractMessageContent, handleIncomingMessage } = require('./message-handler');

const IMAGE_EXTENSION_BY_CONTENT_TYPE = { 'image/png': '.png', 'image/jpeg': '.jpg' };

// Khác bridge/ gốc (gộp NHIỀU ảnh vào 1 sendMessage): commerce/app/zalo_adapter.py đã
// tách message thành `sends[]` (1 entry/tin, mỗi entry 0-1 ảnh) TRƯỚC khi tới đây, nên
// mỗi lần gọi buildSendMessageArg() chỉ có 0 hoặc 1 ảnh -- xem kế hoạch multi-tenant B3.
function buildSendMessageArg(text, imageAttachment) {
  if (!imageAttachment) return text || '';
  const ext = IMAGE_EXTENSION_BY_CONTENT_TYPE[imageAttachment.contentType] || '.jpg';
  return {
    msg: text || '',
    attachments: [{
      data: imageAttachment.data,
      filename: `anh${ext}`,
      metadata: { totalSize: imageAttachment.data.length },
    }],
  };
}

async function startTenantSession({
  tenantId,
  commerceClient,
  credentialsPath,
  qrPath,
  onStatusChange,
  ThreadType,
  logger = console,
  createZaloApiImpl = createZaloApi,
  onSessionReady = () => {},
}) {
  const api = await createZaloApiImpl({ credentialsPath, qrPath, logger, onStatusChange });
  const ownUid = api.getOwnId();
  onStatusChange({ status: 'logged_in' });

  // Shared by the unexpected-close handler and the operator-triggered logout() below, so
  // whichever one fires first "wins" and the other becomes a no-op -- without this, a
  // manual logout that also happens to trigger the underlying listener's own 'closed'
  // event would otherwise restart the session twice.
  let restarted = false;
  function restartSession() {
    if (restarted) return;
    restarted = true;
    try {
      fs.unlinkSync(credentialsPath);
    } catch {
      // no saved credentials file to remove -- nothing to do
    }
    startTenantSession({
      tenantId,
      commerceClient,
      credentialsPath,
      qrPath,
      onStatusChange,
      ThreadType,
      logger,
      createZaloApiImpl,
      onSessionReady,
    }).catch((err) => {
      logger.error(`bridge: failed to restart session for tenant ${tenantId}`, err);
      onStatusChange({ status: 'error', error: err.message });
    });
  }

  api.listener.on('message', async (message) => {
    try {
      if (!shouldHandleMessage(message, ThreadType, ownUid)) return;
      const conversationId = message.type === ThreadType.Group ? message.threadId : message.data.uidFrom;
      // `image` (nếu có) KHÔNG forward lên commerce -- engine.handle() chưa nhận tham số
      // ảnh (câu 14), chỉ dùng `text`/caption.
      const { text } = await extractMessageContent(message, { logger });
      await handleIncomingMessage({
        commerceClient,
        tenantId,
        conversationId,
        text,
        sendReply: (replyText, imageAttachment) =>
          api.sendMessage(buildSendMessageArg(replyText, imageAttachment), conversationId, message.type),
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
    // The saved credentials are what caused createZaloApiImpl to skip the QR flow last
    // time; they're now stale (that's why the session just closed), so restarting removes
    // them and falls back into the QR flow, showing a fresh QR without a manual bridge
    // restart.
    restartSession();
  });

  api.listener.start();
  logger.info(`bridge: tenant ${tenantId} listening for messages`);

  function logout() {
    logger.info(`bridge: logging out tenant ${tenantId} by operator request`);
    api.listener.stop();
    // restartSession() itself removes the stale credentials and re-enters the QR flow,
    // which calls onStatusChange({status:'awaiting_qr'}) once it gets there -- no need to
    // set status here too. The `restarted` guard inside restartSession() means it's safe
    // to call this even if stop() happens to also trigger the 'closed' listener above.
    restartSession();
  }

  // Fires on the initial start AND every restart, so whatever holds this handle (the
  // status-server's logout route) always has the current session's logout, never a stale
  // one from a session that already closed and got replaced.
  onSessionReady({ api, logout });

  return { api, logout };
}

module.exports = { startTenantSession };
