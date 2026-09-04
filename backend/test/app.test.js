'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { TenantStore } = require('../src/db');

function makeApp({ searchResults = [], llmReply = 'ok', embedTexts = null } = {}) {
  const tenantStore = new TenantStore(':memory:');
  const vectorStore = {
    addedChunks: [],
    addChunks: async function (tenantId, chunks) {
      this.addedChunks.push({ tenantId, chunks });
    },
    search: async () => searchResults,
  };
  const embeddingClient = {
    embed: async (texts) => {
      if (embedTexts) embedTexts.push(...texts);
      return texts.map(() => [1, 0, 0]);
    },
  };
  const llmClient = { complete: async () => llmReply };
  const { RagService } = require('../src/rag');
  const ragService = new RagService({ tenantStore, vectorStore, embeddingClient, llmClient });
  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService });
  return { app, tenantStore, vectorStore, embeddingClient };
}

test('POST /tenants creates a tenant and GET /tenants lists it', async () => {
  const { app } = makeApp();

  const createRes = await request(app)
    .post('/tenants')
    .send({ id: 't1', name: 'Truc Lam Vien', systemPrompt: 'Ban la tro ly.' });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.id, 't1');

  const listRes = await request(app).get('/tenants');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].name, 'Truc Lam Vien');
});

test('POST /tenants rejects an invalid tenant id', async () => {
  const { app } = makeApp();
  const res = await request(app)
    .post('/tenants')
    .send({ id: "bad id/with'quote", name: 'A', systemPrompt: 'p' });
  assert.equal(res.status, 400);
});

test('GET /tenants/:id returns 404 for an unknown tenant', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/tenants/nope');
  assert.equal(res.status, 404);
});

test('PUT /tenants/:id updates the system prompt', async () => {
  const { app } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'old' });

  const res = await request(app).put('/tenants/t1').send({ systemPrompt: 'new prompt' });
  assert.equal(res.status, 200);

  const getRes = await request(app).get('/tenants/t1');
  assert.equal(getRes.body.systemPrompt, 'new prompt');
});

test('POST /tenants/:id/documents chunks, embeds, and indexes the uploaded text', async () => {
  const embedTexts = [];
  const { app } = makeApp({ embedTexts });
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from('## Menu\nPho bo - 65000\n'), 'menu.md');

  assert.equal(res.status, 201);
  assert.ok(embedTexts.length >= 1);
  assert.match(embedTexts[0], /Pho bo/);
});

test('POST /tenants/:id/documents returns 404 for an unknown tenant', async () => {
  const { app } = makeApp();
  const res = await request(app)
    .post('/tenants/unknown/documents')
    .attach('file', Buffer.from('content'), 'doc.md');
  assert.equal(res.status, 404);
});

test('POST /tenants/:id/ask returns the RAG reply', async () => {
  const { app } = makeApp({ llmReply: 'Chao ban, gio mo cua la 7h-21h30.' });
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/ask')
    .send({ conversationId: 'c1', text: 'may gio mo cua?' });

  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Chao ban, gio mo cua la 7h-21h30.');
});

test('POST /tenants/:id/ask returns 404 for an unknown tenant', async () => {
  const { app } = makeApp();
  const res = await request(app).post('/tenants/unknown/ask').send({ conversationId: 'c1', text: 'hi' });
  assert.equal(res.status, 404);
});
