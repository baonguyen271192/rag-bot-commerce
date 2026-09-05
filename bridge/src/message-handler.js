'use strict';

const FALLBACK_MESSAGE = 'Xin lỗi, hệ thống đang bận, bạn thử nhắn lại sau ít phút nhé.';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_MIMETYPES = { 'image/jpeg': true, 'image/png': true };

function getAttachmentContent(message) {
  const content = message.data.content;
  if (typeof content === 'string') return null;
  if (content && typeof content.href === 'string') return content;
  return null;
}

function shouldHandleMessage(message, ThreadType, ownUid) {
  const content = message.data.content;
  const isText = typeof content === 'string';
  const isAttachment = !isText && Boolean(getAttachmentContent(message));
  if (!isText && !isAttachment) return false;
  if (message.type === ThreadType.User) return true;
  if (message.type === ThreadType.Group) {
    const mentions = message.data.mentions;
    return Array.isArray(mentions) && mentions.some((m) => m.uid === ownUid);
  }
  return false;
}

async function downloadImageAsDataUri(href, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(href);
  if (!res.ok) {
    throw new Error(`image download failed with status ${res.status}`);
  }
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!SUPPORTED_IMAGE_MIMETYPES[contentType]) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) return null;
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function extractMessageContent(message, { fetchImpl = fetch, logger = console } = {}) {
  const content = message.data.content;
  if (typeof content === 'string') {
    return { text: content, image: null };
  }

  const attachment = getAttachmentContent(message);
  const caption = (attachment && (attachment.title || attachment.description)) || '';
  if (!attachment) {
    return { text: caption, image: null };
  }

  try {
    const image = await downloadImageAsDataUri(attachment.href, { fetchImpl });
    if (!image) {
      return { text: caption || 'Khach gui mot dinh kem khong ho tro.', image: null };
    }
    return { text: caption || 'Khach gui mot anh, khong co chu thich.', image };
  } catch (err) {
    logger.error('bridge: failed to download image attachment', { href: attachment.href, error: err.message });
    return { text: caption || 'Khach gui mot anh nhung tai ve loi.', image: null };
  }
}

async function handleIncomingMessage({ backendClient, tenantId, conversationId, text, image, sendReply, logger = console }) {
  try {
    const reply = await backendClient.ask(tenantId, { conversationId, text, image });
    await sendReply(reply || FALLBACK_MESSAGE);
  } catch (err) {
    logger.error('bridge: failed to handle message', { tenantId, conversationId, error: err.message });
    await sendReply(FALLBACK_MESSAGE);
  }
}

module.exports = { shouldHandleMessage, extractMessageContent, handleIncomingMessage, FALLBACK_MESSAGE };
