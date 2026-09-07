'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RagService } = require('../src/rag');

function makeFakes({ tenant, searchResults, llmReply, recentMessages = [], documents = {} } = {}) {
  const savedMessages = [];
  const tenantStore = {
    getTenant: () => tenant,
    addMessage: (msg) => savedMessages.push(msg),
    getRecentMessages: () => recentMessages,
    getDocument: (docId) => documents[docId] || null,
  };
  const embedCalls = [];
  const embeddingClient = {
    embed: async (texts) => {
      embedCalls.push(texts);
      return texts.map(() => [1, 0, 0]);
    },
  };
  const searchCalls = [];
  const vectorStore = {
    search: async (tenantId, embedding, k) => {
      searchCalls.push({ tenantId, embedding, k });
      return searchResults;
    },
  };
  const completeCalls = [];
  const llmClient = {
    complete: async (args) => {
      completeCalls.push(args);
      return llmReply;
    },
  };
  return { tenantStore, embeddingClient, vectorStore, llmClient, savedMessages, embedCalls, searchCalls, completeCalls };
}

test('answer embeds the question, searches the tenant vector store, and asks the LLM with retrieved context', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'Ban la tro ly QMS.' },
    searchResults: [{ text: 'Gio mo cua: 7h-21h30', score: 0.1 }],
    llmReply: 'Nha hang mo cua 7h-21h30.',
  });
  const rag = new RagService(fakes);

  const { reply, attachments } = await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'may gio mo cua?' });

  assert.equal(reply, 'Nha hang mo cua 7h-21h30.');
  assert.deepEqual(attachments, []);
  assert.deepEqual(fakes.embedCalls[0], ['may gio mo cua?']);
  assert.equal(fakes.searchCalls[0].tenantId, 't1');
  assert.deepEqual(fakes.searchCalls[0].embedding, [1, 0, 0]);
  const llmCall = fakes.completeCalls[0];
  assert.equal(llmCall.systemPrompt, 'Ban la tro ly QMS.');
  assert.match(llmCall.messages[llmCall.messages.length - 1].content, /Gio mo cua: 7h-21h30/);
  assert.match(llmCall.messages[llmCall.messages.length - 1].content, /may gio mo cua\?/);
});

test('answer includes recent conversation history before the new question', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'p' },
    searchResults: [],
    llmReply: 'ok',
    recentMessages: [
      { role: 'user', text: 'xin chao' },
      { role: 'assistant', text: 'chao ban' },
    ],
  });
  const rag = new RagService(fakes);

  await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'menu co gi' });

  const llmCall = fakes.completeCalls[0];
  assert.deepEqual(llmCall.messages.slice(0, 2), [
    { role: 'user', content: 'xin chao' },
    { role: 'assistant', content: 'chao ban' },
  ]);
});

test('answer saves both the user message and the assistant reply', async () => {
  const fakes = makeFakes({ tenant: { id: 't1', systemPrompt: 'p' }, searchResults: [], llmReply: 'reply text' });
  const rag = new RagService(fakes);

  await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'hello' });

  assert.deepEqual(fakes.savedMessages, [
    { tenantId: 't1', conversationId: 'c1', role: 'user', text: 'hello' },
    { tenantId: 't1', conversationId: 'c1', role: 'assistant', text: 'reply text' },
  ]);
});

test('answer throws when the tenant does not exist', async () => {
  const fakes = makeFakes({ tenant: null, searchResults: [], llmReply: 'x' });
  const rag = new RagService(fakes);
  await assert.rejects(
    () => rag.answer({ tenantId: 'missing', conversationId: 'c1', text: 'hi' }),
    /tenant not found/i
  );
});

test('answer attaches the image to the current turn as vision content when provided, but does not persist it', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'p' },
    searchResults: [],
    llmReply: 'day la mon pho',
  });
  const rag = new RagService(fakes);

  await rag.answer({
    tenantId: 't1',
    conversationId: 'c1',
    text: 'day la mon gi?',
    image: 'data:image/jpeg;base64,AAA=',
  });

  const llmCall = fakes.completeCalls[0];
  const currentMessage = llmCall.messages[llmCall.messages.length - 1];
  assert.deepEqual(currentMessage, {
    role: 'user',
    content: [
      { type: 'text', text: 'day la mon gi?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA=' } },
    ],
  });
  assert.deepEqual(fakes.savedMessages, [
    { tenantId: 't1', conversationId: 'c1', role: 'user', text: 'day la mon gi?' },
    { tenantId: 't1', conversationId: 'c1', role: 'assistant', text: 'day la mon pho' },
  ]);
});

test('answer includes an attachment pointing at the top match\'s page when it came from a PDF', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'p' },
    searchResults: [{ text: 'Com nieu - 20000', score: 0.05, docId: 'menu.pdf_1', page: 3 }],
    llmReply: 'Com nieu gia 20.000d',
    documents: { 'menu.pdf_1': { id: 'menu.pdf_1', mimetype: 'application/pdf' } },
  });
  const rag = new RagService(fakes);

  const { attachments } = await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'com nieu gia bao nhieu' });

  assert.deepEqual(attachments, [{ docId: 'menu.pdf_1', page: 3, mimetype: 'image/png' }]);
});

test('answer includes an attachment with the original mimetype when a match came from an uploaded image', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'p' },
    searchResults: [{ text: 'Pho bo - 65000', score: 0.05, docId: 'menu.jpg_1', page: 1 }],
    llmReply: 'Pho bo gia 65.000d',
    documents: { 'menu.jpg_1': { id: 'menu.jpg_1', mimetype: 'image/jpeg' } },
  });
  const rag = new RagService(fakes);

  const { attachments } = await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'pho bo gia bao nhieu' });

  assert.deepEqual(attachments, [{ docId: 'menu.jpg_1', page: 1, mimetype: 'image/jpeg' }]);
});

test('answer returns no attachments when no match has a page (plain text document)', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'p' },
    searchResults: [{ text: 'Gio mo cua: 7h-21h30', score: 0.05, docId: 'info.md_1', page: 0 }],
    llmReply: 'Mo cua 7h-21h30',
    documents: { 'info.md_1': { id: 'info.md_1', mimetype: 'text/markdown' } },
  });
  const rag = new RagService(fakes);

  const { attachments } = await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'gio mo cua' });

  assert.deepEqual(attachments, []);
});

test('answer skips a match whose document was deleted after indexing, without failing the whole request', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'p' },
    searchResults: [{ text: 'stale chunk', score: 0.05, docId: 'deleted-doc', page: 2 }],
    llmReply: 'ok',
    documents: {},
  });
  const rag = new RagService(fakes);

  const { attachments } = await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'hoi gi do' });

  assert.deepEqual(attachments, []);
});

test('answer includes one attachment per distinct page across all retrieved matches, for a broad question', async () => {
  const fakes = makeFakes({
    tenant: { id: 't1', systemPrompt: 'p' },
    searchResults: [
      { text: 'Khai vi: Banh trang nuong - 65000', score: 0.02, docId: 'menu.pdf_1', page: 1 },
      { text: 'Khai vi: Salad dau giam - 105000', score: 0.03, docId: 'menu.pdf_1', page: 1 },
      { text: 'Mon chinh: Ca kho to - 135000', score: 0.05, docId: 'menu.pdf_1', page: 2 },
      { text: 'Gio mo cua: 7h-21h30', score: 0.09, docId: 'info.md_1', page: 0 },
    ],
    llmReply: 'Duoi day la thuc don...',
    documents: {
      'menu.pdf_1': { id: 'menu.pdf_1', mimetype: 'application/pdf' },
      'info.md_1': { id: 'info.md_1', mimetype: 'text/markdown' },
    },
  });
  const rag = new RagService(fakes);

  const { attachments } = await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'menu' });

  assert.deepEqual(attachments, [
    { docId: 'menu.pdf_1', page: 1, mimetype: 'image/png' },
    { docId: 'menu.pdf_1', page: 2, mimetype: 'image/png' },
  ]);
});
