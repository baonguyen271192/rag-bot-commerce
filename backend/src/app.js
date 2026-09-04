'use strict';

const express = require('express');
const multer = require('multer');
const { chunkText } = require('./chunker');

const upload = multer({ storage: multer.memoryStorage() });

function createApp({ tenantStore, vectorStore, embeddingClient, ragService }) {
  const app = express();
  app.use(express.json());

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
      const text = req.file.buffer.toString('utf8');
      const chunks = chunkText(text);
      const embeddings = await embeddingClient.embed(chunks);
      await vectorStore.addChunks(
        req.params.id,
        chunks.map((text, i) => ({ text, embedding: embeddings[i], docId }))
      );
      res.status(201).json({ docId, chunkCount: chunks.length });
    } catch (err) {
      next(err);
    }
  });

  app.post('/tenants/:id/ask', async (req, res, next) => {
    try {
      const tenant = tenantStore.getTenant(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'tenant not found' });

      const reply = await ragService.answer({
        tenantId: req.params.id,
        conversationId: req.body.conversationId,
        text: req.body.text,
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
