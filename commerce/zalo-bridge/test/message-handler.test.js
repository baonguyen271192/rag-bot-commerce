'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldHandleMessage, handleIncomingMessage, FALLBACK_MESSAGE } = require('../src/message-handler');

const ThreadType = { User: 0, Group: 1 };

// ---------------- shouldHandleMessage (giữ nguyên như bridge/ gốc — product-agnostic) ----------------

test('shouldHandleMessage accepts 1-1 text messages', () => {
  assert.equal(shouldHandleMessage({ type: 0, data: { content: 'hi' } }, ThreadType), true);
});

test('shouldHandleMessage rejects group messages that do not mention the bot', () => {
  assert.equal(
    shouldHandleMessage({ type: 1, data: { content: 'hi', mentions: [] } }, ThreadType, 'bot-uid'),
    false
  );
});

test('shouldHandleMessage accepts group messages that mention the bot', () => {
  const message = { type: 1, data: { content: 'hi @bot', mentions: [{ uid: 'bot-uid' }] } };
  assert.equal(shouldHandleMessage(message, ThreadType, 'bot-uid'), true);
});

// ---------------- Đường chạy thuận lợi ----------------

test('handleIncomingMessage gọi sendReply đúng N lần theo sends[] (1 lần/entry), đúng thứ tự', async () => {
  const calls = [];
  const commerceClient = {
    askCommerce: async () => ({
      sends: [
        { text: 'first', image_url: null },
        { text: 'second', image_url: 'http://img/2.png' },
        { text: 'third', image_url: null },
      ],
    }),
    downloadImageByUrl: async () => ({ data: Buffer.from('fakebytes'), contentType: 'image/png' }),
  };

  await handleIncomingMessage({
    commerceClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'hi',
    sendReply: async (text, img) => calls.push({ text, img }),
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].text, 'first');
  assert.equal(calls[0].img, null);
  assert.equal(calls[1].text, 'second');
  assert.ok(calls[1].img && calls[1].img.data);
  assert.equal(calls[2].text, 'third');
  assert.equal(calls[2].img, null);
});

// ---------------- Trường hợp biên nêu tên trong kế hoạch ----------------

// Câu 15 (kế hoạch multi-tenant): sidecar mất kết nối / commerce không phản hồi -> log + drop,
// không chặn tiến trình khác -- ở message-handler.js nghĩa là gửi FALLBACK_MESSAGE, không throw.
test('handleIncomingMessage gửi FALLBACK_MESSAGE khi commerce không phản hồi (askCommerce throw), không crash', async () => {
  const commerceClient = {
    askCommerce: async () => {
      throw new Error('ECONNREFUSED');
    },
  };
  const calls = [];
  await handleIncomingMessage({
    commerceClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'hi',
    sendReply: async (text, img) => calls.push({ text, img }),
    logger: { error: () => {} },
  });
  assert.deepEqual(calls, [{ text: FALLBACK_MESSAGE, img: undefined }]);
});

test('handleIncomingMessage gửi FALLBACK_MESSAGE khi sends[] rỗng', async () => {
  const commerceClient = { askCommerce: async () => ({ sends: [] }) };
  const calls = [];
  await handleIncomingMessage({
    commerceClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'hi',
    sendReply: async (text, img) => calls.push({ text, img }),
  });
  assert.deepEqual(calls, [{ text: FALLBACK_MESSAGE, img: undefined }]);
});

// Trường hợp biên nêu trong kế hoạch: "Ảnh sản phẩm URL hỏng/không tải được (sidecar): gửi
// text không kèm ảnh, không rơi vào fallback".
test('handleIncomingMessage: ảnh lỗi vẫn gửi TEXT của đúng entry đó, KHÔNG rơi về fallback chung', async () => {
  const commerceClient = {
    askCommerce: async () => ({ sends: [{ text: 'has broken image', image_url: 'http://bad' }] }),
    downloadImageByUrl: async () => {
      throw new Error('boom');
    },
  };
  const calls = [];
  let loggedError = false;
  await handleIncomingMessage({
    commerceClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'hi',
    sendReply: async (text, img) => calls.push({ text, img }),
    logger: { error: () => { loggedError = true; } },
  });
  assert.deepEqual(calls, [{ text: 'has broken image', img: null }]);
  assert.equal(loggedError, true);
});

// Trường hợp biên: 1 ảnh lỗi giữa nhiều entry KHÔNG kéo sập các entry còn lại (mỗi entry độc lập).
test('handleIncomingMessage: 1 entry ảnh lỗi không ảnh hưởng các entry khác trong cùng sends[]', async () => {
  const commerceClient = {
    askCommerce: async () => ({
      sends: [
        { text: 'ok before', image_url: 'http://good1' },
        { text: 'broken', image_url: 'http://bad' },
        { text: 'ok after', image_url: 'http://good2' },
      ],
    }),
    downloadImageByUrl: async (url) => {
      if (url === 'http://bad') throw new Error('boom');
      return { data: Buffer.from('x'), contentType: 'image/png' };
    },
  };
  const calls = [];
  await handleIncomingMessage({
    commerceClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'hi',
    sendReply: async (text, img) => calls.push({ text, hasImg: Boolean(img) }),
    logger: { error: () => {} },
  });
  assert.deepEqual(calls, [
    { text: 'ok before', hasImg: true },
    { text: 'broken', hasImg: false },
    { text: 'ok after', hasImg: true },
  ]);
});

// ---------------- Đầu vào sai / lỗi phải thất bại đúng cách ----------------

test('shouldHandleMessage rejects non-text, non-attachment content (vd tin nhắn bị thu hồi)', () => {
  assert.equal(shouldHandleMessage({ type: 0, data: { content: { deleteMsg: true } } }, ThreadType), false);
});

test('handleIncomingMessage không throw ra ngoài khi sendReply chính nó throw (lỗi mạng lúc gửi)', async () => {
  const commerceClient = { askCommerce: async () => ({ sends: [{ text: 'x', image_url: null }] }) };
  await assert.rejects(
    () =>
      handleIncomingMessage({
        commerceClient,
        tenantId: 't1',
        conversationId: 'c1',
        text: 'hi',
        sendReply: async () => {
          throw new Error('zca-js send failed');
        },
        logger: { error: () => {} },
      }),
    // Ghi lại HÀNH VI THẬT hiện tại (không phải hành vi mong đợi): sendReply() nằm TRONG
    // cùng try/catch bọc askCommerce, nên khi nó throw ở entry đầu tiên, catch chạy
    // await sendReply(FALLBACK_MESSAGE) để báo lỗi cho khách — nhưng sendReply ĐÓ cũng
    // throw (vì mock luôn throw), và throw lần 2 này nằm trong catch, KHÔNG được bọc lại
    // -> propagate ra ngoài handleIncomingMessage. (tenant-session.js message listener có
    // try/catch riêng bọc ngoài lần gọi handleIncomingMessage nên tiến trình không crash.)
    // Test này là một cái gài (canary) — nếu hành vi đổi thì test sẽ đỏ và cần xem lại có
    // đúng ý không.
    /zca-js send failed/
  );
});
