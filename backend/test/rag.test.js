'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RagService } = require('../src/rag');

function makeFakes({ tenant, searchResults, llmReply, recentMessages = [] } = {}) {
  const savedMessages = [];
  const tenantStore = {
    getTenant: () => tenant,
    addMessage: (msg) => savedMessages.push(msg),
    getRecentMessages: () => recentMessages,
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

  const reply = await rag.answer({ tenantId: 't1', conversationId: 'c1', text: 'may gio mo cua?' });

  assert.equal(reply, 'Nha hang mo cua 7h-21h30.');
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
