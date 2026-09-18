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

// Product-agnostic: giữ NGUYÊN như bridge/ gốc (lọc DM/mention, không phụ thuộc
// backend/commerce nào) -- xem kế hoạch multi-tenant B3.
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

// Giữ NGUYÊN như bridge/ gốc (product-agnostic) -- xem kế hoạch multi-tenant B3. LƯU Ý:
// `image` mà hàm này trả về KHÔNG được tenant-session.js forward lên commerce -- ảnh
// khách gửi VÀO (inbound) không được commerce/app/engine.py xử lý (engine.handle()
// không có tham số ảnh, xem CLAUDE.md/kế hoạch câu 14). Giữ lại field `image` ở đây chỉ
// để không đổi hành vi tải/log của hàm gốc, không phải vì commerce dùng tới.
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

// Khác bridge/ gốc: commerce trả về NHIỀU tin cần gửi (`sends[]`, 1 phần tử/sản phẩm --
// xem app/zalo_adapter.py) thay vì 1 reply + mảng ảnh gộp, nên gọi `sendReply` N LẦN
// (1 lần/entry), không phải 1 lần với mảng ảnh gộp như bridge/ gốc.
async function handleIncomingMessage({ commerceClient, tenantId, conversationId, text, sendReply, logger = console }) {
  try {
    const { sends } = await commerceClient.askCommerce(tenantId, { senderId: conversationId, text });
    if (!sends || sends.length === 0) {
      await sendReply(FALLBACK_MESSAGE);
      return;
    }
    for (const send of sends) {
      let imageAttachment = null;
      if (send.image_url) {
        try {
          imageAttachment = await commerceClient.downloadImageByUrl(send.image_url);
        } catch (err) {
          // Ảnh lỗi/không tải được -- vẫn gửi TEXT, không kèm ảnh, không rơi vào fallback
          // (giống tinh thần bridge/ gốc bỏ qua ảnh lỗi mà không huỷ cả câu trả lời).
          logger.error('bridge: failed to download product image, sending text only', {
            tenantId,
            conversationId,
            imageUrl: send.image_url,
            error: err.message,
          });
        }
      }
      await sendReply(send.text || '', imageAttachment);
    }
  } catch (err) {
    logger.error('bridge: failed to handle message', { tenantId, conversationId, error: err.message });
    await sendReply(FALLBACK_MESSAGE);
  }
}

module.exports = { shouldHandleMessage, extractMessageContent, handleIncomingMessage, FALLBACK_MESSAGE };
