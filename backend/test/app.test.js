'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { TenantStore } = require('../src/db');

function makeApp({
  searchResults = [],
  llmReply = 'ok',
  embedTexts = null,
  completeCalls = null,
  llmClientOverride = null,
} = {}) {
  const tenantStore = new TenantStore(':memory:');
  const vectorStore = {
    addedChunks: [],
    addChunks: async function (tenantId, chunks) {
      this.addedChunks.push({ tenantId, chunks });
    },
    search: async () => searchResults,
    deletedDocuments: [],
    deleteDocument: async function (tenantId, docId) {
      this.deletedDocuments.push({ tenantId, docId });
    },
  };
  const embeddingClient = {
    embed: async (texts) => {
      if (embedTexts) embedTexts.push(...texts);
      return texts.map(() => [1, 0, 0]);
    },
  };
  const llmClient =
    llmClientOverride || {
      complete: async (args) => {
        if (completeCalls) completeCalls.push(args);
        return llmReply;
      },
    };
  const { RagService } = require('../src/rag');
  const ragService = new RagService({ tenantStore, vectorStore, embeddingClient, llmClient });
  const app = createApp({
    tenantStore,
    vectorStore,
    embeddingClient,
    ragService,
    llmClient,
  });
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

test('responses include a permissive CORS header for admin-ui', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/tenants');
  assert.ok(res.headers['access-control-allow-origin']);
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

test('POST /tenants/:id/documents records the upload, and GET /tenants/:id/documents lists it', async () => {
  const { app } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const uploadRes = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from('## Menu\nPho bo - 65000\n'), 'menu.md');
  assert.equal(uploadRes.status, 201);

  const listRes = await request(app).get('/tenants/t1/documents');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].id, uploadRes.body.docId);
  assert.equal(listRes.body[0].filename, 'menu.md');
  assert.equal(listRes.body[0].chunkCount, uploadRes.body.chunkCount);
});

test('GET /tenants/:id/documents returns 404 for an unknown tenant', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/tenants/unknown/documents');
  assert.equal(res.status, 404);
});

test('GET /tenants/:id/documents returns an empty list for a tenant with no uploads', async () => {
  const { app } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });
  const res = await request(app).get('/tenants/t1/documents');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('DELETE /tenants/:id/documents/:docId removes it from the vector store and the list', async () => {
  const { app, vectorStore } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });
  const uploadRes = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from('## Menu\nPho bo - 65000\n'), 'menu.md');
  const docId = uploadRes.body.docId;

  const deleteRes = await request(app).delete(`/tenants/t1/documents/${docId}`);

  assert.equal(deleteRes.status, 204);
  const listRes = await request(app).get('/tenants/t1/documents');
  assert.deepEqual(listRes.body, []);
  assert.deepEqual(vectorStore.deletedDocuments, [{ tenantId: 't1', docId }]);
});

test('DELETE /tenants/:id/documents/:docId returns 404 for an unknown tenant', async () => {
  const { app } = makeApp();
  const res = await request(app).delete('/tenants/unknown/documents/some-doc');
  assert.equal(res.status, 404);
});

test('DELETE /tenants/:id/documents/:docId returns 404 for a document that does not belong to that tenant', async () => {
  const { app } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });
  await request(app).post('/tenants').send({ id: 't2', name: 'B', systemPrompt: 'p' });
  const uploadRes = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from('content'), 'a.md');

  const res = await request(app).delete(`/tenants/t2/documents/${uploadRes.body.docId}`);

  assert.equal(res.status, 404);
});

test('POST /tenants/:id/documents extracts text from an uploaded image via the vision LLM before indexing', async () => {
  const embedTexts = [];
  const visionCalls = [];
  const { app } = makeApp({
    embedTexts,
    llmClientOverride: {
      complete: async (args) => {
        visionCalls.push(args);
        return 'Pho bo - 65000';
      },
    },
  });
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'menu.jpg', contentType: 'image/jpeg' });

  assert.equal(res.status, 201);
  assert.equal(visionCalls.length, 1);
  assert.match(visionCalls[0].messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.ok(embedTexts.length >= 1);
  assert.match(embedTexts[0], /Pho bo/);
});

test('POST /tenants/:id/documents returns 422 when the vision LLM cannot read the image', async () => {
  const { app } = makeApp({
    llmClientOverride: {
      complete: async () => {
        throw new Error('bad image');
      },
    },
  });
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'menu.jpg', contentType: 'image/jpeg' });

  assert.equal(res.status, 422);
});

test('POST /tenants/:id/documents returns 422 when the vision LLM extracts no usable text', async () => {
  const { app } = makeApp({ llmClientOverride: { complete: async () => '   ' } });
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'menu.jpg', contentType: 'image/jpeg' });

  assert.equal(res.status, 422);
});

test('POST /tenants/:id/documents extracts text from an uploaded PDF and indexes it', async () => {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText('Pho bo - 65000', { x: 50, y: 700, size: 24, font });
  const pdfBytes = await pdfDoc.save();

  const embedTexts = [];
  const { app } = makeApp({ embedTexts });
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from(pdfBytes), { filename: 'menu.pdf', contentType: 'application/pdf' });

  assert.equal(res.status, 201);
  assert.ok(embedTexts.length >= 1);
  assert.match(embedTexts[0], /Pho bo/);
});

test('POST /tenants/:id/documents returns 422 for a PDF with no extractable text', async () => {
  const { app } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from('%PDF-1.4 not a real pdf'), { filename: 'menu.pdf', contentType: 'application/pdf' });

  assert.equal(res.status, 422);
});

test('POST /tenants/:id/documents returns a clear 413 (not a generic 500) when the file exceeds 5MB', async () => {
  const { app } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.alloc(6 * 1024 * 1024), { filename: 'big.pdf', contentType: 'application/pdf' });

  assert.equal(res.status, 413);
  assert.match(res.body.error, /5MB/);
});

test('POST /tenants/:id/documents returns a clear 502 (not a generic 500) when the embedding call fails', async () => {
  const embeddingClient = {
    embed: async () => {
      throw new Error('Gemini embeddings request failed with status 429: rate limited');
    },
  };
  const tenantStore = new TenantStore(':memory:');
  const vectorStore = { addChunks: async () => {}, search: async () => [] };
  const llmClient = { complete: async () => 'ok' };
  const { RagService } = require('../src/rag');
  const ragService = new RagService({ tenantStore, vectorStore, embeddingClient, llmClient });
  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient });

  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/documents')
    .attach('file', Buffer.from('## Menu\nPho bo\n'), 'menu.md');

  assert.equal(res.status, 502);
  assert.match(res.body.error, /khong tao duoc embedding/);
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

test('POST /tenants/:id/ask accepts an optional image and forwards it as vision content', async () => {
  const completeCalls = [];
  const { app } = makeApp({ completeCalls });
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/ask')
    .send({ conversationId: 'c1', text: 'day la mon gi?', image: 'data:image/jpeg;base64,AAA=' });

  assert.equal(res.status, 200);
  const lastMessage = completeCalls[0].messages[completeCalls[0].messages.length - 1];
  assert.deepEqual(lastMessage.content[1], {
    type: 'image_url',
    image_url: { url: 'data:image/jpeg;base64,AAA=' },
  });
});

test('POST /tenants/:id/ask rejects a malformed image field', async () => {
  const { app } = makeApp();
  await request(app).post('/tenants').send({ id: 't1', name: 'A', systemPrompt: 'p' });

  const res = await request(app)
    .post('/tenants/t1/ask')
    .send({ conversationId: 'c1', text: 'hi', image: 'not-a-data-uri' });

  assert.equal(res.status, 400);
});
