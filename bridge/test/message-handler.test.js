'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldHandleMessage,
  extractMessageContent,
  handleIncomingMessage,
  FALLBACK_MESSAGE,
} = require('../src/message-handler');

const ThreadType = { User: 0, Group: 1 };

test('shouldHandleMessage accepts 1-1 text messages', () => {
  assert.equal(shouldHandleMessage({ type: 0, data: { content: 'hi' } }, ThreadType), true);
});

test('shouldHandleMessage accepts 1-1 messages with an image attachment', () => {
  const message = { type: 0, data: { content: { href: 'http://cdn/img.jpg', title: '', description: '' } } };
  assert.equal(shouldHandleMessage(message, ThreadType), true);
});

test('shouldHandleMessage rejects non-text, non-attachment content', () => {
  assert.equal(shouldHandleMessage({ type: 0, data: { content: { deleteMsg: true } } }, ThreadType), false);
});

test('shouldHandleMessage rejects group messages that do not mention the bot', () => {
  assert.equal(
    shouldHandleMessage({ type: 1, data: { content: 'hi', mentions: [] } }, ThreadType, 'bot-uid'),
    false
  );
});

test('shouldHandleMessage rejects group messages with no mentions field at all', () => {
  assert.equal(shouldHandleMessage({ type: 1, data: { content: 'hi' } }, ThreadType, 'bot-uid'), false);
});

test('shouldHandleMessage accepts group messages that mention the bot', () => {
  const message = { type: 1, data: { content: 'hi @bot', mentions: [{ uid: 'bot-uid', pos: 3, len: 4 }] } };
  assert.equal(shouldHandleMessage(message, ThreadType, 'bot-uid'), true);
});

test('shouldHandleMessage rejects group messages that mention someone else', () => {
  const message = { type: 1, data: { content: 'hi @someone', mentions: [{ uid: 'someone-else', pos: 3, len: 8 }] } };
  assert.equal(shouldHandleMessage(message, ThreadType, 'bot-uid'), false);
});

test('extractMessageContent returns the plain text for a text message', async () => {
  const message = { data: { content: 'may gio mo cua?' } };
  const result = await extractMessageContent(message, {});
  assert.deepEqual(result, { text: 'may gio mo cua?', image: null });
});

test('extractMessageContent downloads and base64-encodes a supported image attachment', async () => {
  const message = { data: { content: { href: 'http://cdn/menu.jpg', title: '', description: '' } } };
  const fetchImpl = async (url) => {
    assert.equal(url, 'http://cdn/menu.jpg');
    return {
      ok: true,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  };

  const result = await extractMessageContent(message, { fetchImpl });

  assert.equal(result.image, `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString('base64')}`);
  assert.equal(result.text, 'Khach gui mot anh, khong co chu thich.');
});

test('extractMessageContent uses the attachment title as the caption when present', async () => {
  const message = { data: { content: { href: 'http://cdn/menu.jpg', title: 'Menu hom nay', description: '' } } };
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => new Uint8Array([9]).buffer,
  });

  const result = await extractMessageContent(message, { fetchImpl });

  assert.equal(result.text, 'Menu hom nay');
  assert.match(result.image, /^data:image\/png;base64,/);
});

test('extractMessageContent ignores an attachment whose content-type is not jpg/png', async () => {
  const message = { data: { content: { href: 'http://cdn/clip.mp4', title: '', description: '' } } };
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => 'video/mp4' },
    arrayBuffer: async () => new ArrayBuffer(10),
  });

  const result = await extractMessageContent(message, { fetchImpl });

  assert.equal(result.image, null);
});

test('extractMessageContent ignores an attachment over the 5MB size cap', async () => {
  const message = { data: { content: { href: 'http://cdn/big.jpg', title: '', description: '' } } };
  const bigBuffer = new ArrayBuffer(6 * 1024 * 1024);
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => bigBuffer,
  });

  const result = await extractMessageContent(message, { fetchImpl });

  assert.equal(result.image, null);
});

test('extractMessageContent falls back gracefully when the image download fails', async () => {
  const message = { data: { content: { href: 'http://cdn/gone.jpg', title: '', description: '' } } };
  const fetchImpl = async () => {
    throw new Error('network error');
  };

  const result = await extractMessageContent(message, { fetchImpl, logger: { error: () => {}, info: () => {} } });

  assert.equal(result.image, null);
  assert.equal(result.text, 'Khach gui mot anh nhung tai ve loi.');
});

test('handleIncomingMessage sends the backend reply', async () => {
  const backendClient = { ask: async () => 'Nha hang mo cua 7h-21h30.' };
  const sent = [];
  await handleIncomingMessage({
    backendClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'may gio mo cua?',
    image: null,
    sendReply: async (text) => sent.push(text),
  });
  assert.deepEqual(sent, ['Nha hang mo cua 7h-21h30.']);
});

test('handleIncomingMessage sends the fallback message when the backend call throws', async () => {
  const backendClient = {
    ask: async () => {
      throw new Error('backend unreachable');
    },
  };
  const sent = [];
  await handleIncomingMessage({
    backendClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'hi',
    image: null,
    sendReply: async (text) => sent.push(text),
    logger: { error: () => {} },
  });
  assert.deepEqual(sent, [FALLBACK_MESSAGE]);
});

test('handleIncomingMessage sends the fallback message when the backend returns no usable reply', async () => {
  const backendClient = { ask: async () => '' };
  const sent = [];
  await handleIncomingMessage({
    backendClient,
    tenantId: 't1',
    conversationId: 'c1',
    text: 'hi',
    image: null,
    sendReply: async (text) => sent.push(text),
  });
  assert.deepEqual(sent, [FALLBACK_MESSAGE]);
});
