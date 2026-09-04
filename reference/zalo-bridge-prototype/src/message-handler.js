'use strict';

const FALLBACK_MESSAGE = 'Xin lỗi, hệ thống đang bận, bạn thử nhắn lại sau ít phút nhé.';

async function handleIncomingMessage({ store, backendClient, sendReply, zaloUserId, text, logger = console }) {
  let threadId = store.getThreadId(zaloUserId);
  try {
    if (!threadId) {
      threadId = await backendClient.createThread();
      store.saveThreadId(zaloUserId, threadId);
    }
    const reply = await backendClient.runSync(threadId, text);
    await sendReply(zaloUserId, reply || FALLBACK_MESSAGE);
  } catch (err) {
    logger.error('zalo-bridge: failed to handle message', { zaloUserId, error: err.message });
    await sendReply(zaloUserId, FALLBACK_MESSAGE);
  }
}

function shouldHandleMessage(message, ThreadType, ownUid) {
  if (typeof message.data.content !== 'string') return false;
  if (message.type === ThreadType.User) return true;
  if (message.type === ThreadType.Group) {
    const mentions = message.data.mentions;
    return Array.isArray(mentions) && mentions.some((m) => m.uid === ownUid);
  }
  return false;
}

module.exports = { handleIncomingMessage, FALLBACK_MESSAGE, shouldHandleMessage };
