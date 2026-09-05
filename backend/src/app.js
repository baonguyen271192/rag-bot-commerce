'use strict';

const express = require('express');
const multer = require('multer');
const { chunkText } = require('./chunker');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const IMAGE_DATA_URI_RE = /^data:image\/(jpeg|png);base64,/;
const IMAGE_MIMETYPES = { 'image/jpeg': true, 'image/png': true };
const VISION_EXTRACT_SYSTEM_PROMPT =
  'Ban la cong cu trich xuat noi dung tai lieu tu anh. Doc toan bo chu va thong tin trong anh ' +
  '(ten mon, gia, mo ta, ghi chu...) va chep lai chinh xac, day du thanh van ban thuan. ' +
  'Khong dinh dang markdown, khong them binh luan hay giai thich.';

function createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient }) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/tenants', (req, res) => {
    const { id, name, systemPrompt } = req.body;
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      return res
        .status(400)
        .json({ error: 'id must be a non-empty string of lowercase letters, digits, and hyphens only' });
    }
    const tenant = tenantStore.createTenant({ id, name, systemPrompt });
    res.status(201).json(tenant);
  });

  app.get('/tenants', (req, res) => {
    res.json(tenantStore.listTenants());
  });

  app.get('/tenants/:id', (req, res) => {
    const tenant = tenantStore.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'tenant not found' });
    res.json(tenant);
  });

  app.put('/tenants/:id', (req, res) => {
    const tenant = tenantStore.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'tenant not found' });
    tenantStore.updateTenantPrompt(req.params.id, req.body.systemPrompt);
    res.json({ ok: true });
  });

  app.post('/tenants/:id/documents', upload.single('file'), async (req, res, next) => {
    try {
      const tenant = tenantStore.getTenant(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'tenant not found' });

      const docId = `${req.file.originalname}_${Date.now()}`;
      let text;
      if (IMAGE_MIMETYPES[req.file.mimetype]) {
        const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        try {
          text = await llmClient.complete({
            systemPrompt: VISION_EXTRACT_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Trich xuat noi dung anh nay.' },
                  { type: 'image_url', image_url: { url: dataUri } },
                ],
              },
            ],
          });
        } catch (err) {
          return res.status(422).json({ error: `khong the doc noi dung anh: ${err.message}` });
        }
        if (!text || !text.trim()) {
          return res.status(422).json({ error: 'anh khong co noi dung doc duoc' });
        }
      } else {
        text = req.file.buffer.toString('utf8');
      }

      const chunks = chunkText(text);
      const embeddings = await embeddingClient.embed(chunks);
      await vectorStore.addChunks(
        req.params.id,
        chunks.map((text, i) => ({ text, embedding: embeddings[i], docId }))
      );
      tenantStore.addDocument({ id: docId, tenantId: req.params.id, filename: req.file.originalname, chunkCount: chunks.length });
      res.status(201).json({ docId, chunkCount: chunks.length });
    } catch (err) {
      next(err);
    }
  });

  app.get('/tenants/:id/documents', (req, res) => {
    const tenant = tenantStore.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'tenant not found' });
    res.json(tenantStore.listDocuments(req.params.id));
  });

  app.delete('/tenants/:id/documents/:docId', async (req, res, next) => {
    try {
      const tenant = tenantStore.getTenant(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'tenant not found' });

      const doc = tenantStore.getDocument(req.params.docId);
      if (!doc || doc.tenantId !== req.params.id) {
        return res.status(404).json({ error: 'document not found' });
      }

      await vectorStore.deleteDocument(req.params.id, req.params.docId);
      tenantStore.deleteDocument(req.params.docId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.post('/tenants/:id/ask', async (req, res, next) => {
    try {
      const tenant = tenantStore.getTenant(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'tenant not found' });

      const { image } = req.body;
      if (image !== undefined && !IMAGE_DATA_URI_RE.test(image)) {
        return res
          .status(400)
          .json({ error: 'image must be a data:image/jpeg or data:image/png base64 URI' });
      }

      const reply = await ragService.answer({
        tenantId: req.params.id,
        conversationId: req.body.conversationId,
        text: req.body.text,
        image,
      });
      res.json({ reply });
    } catch (err) {
      next(err);
    }
  });

  app.use((err, req, res, next) => {
    console.error('backend: unhandled route error', err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
