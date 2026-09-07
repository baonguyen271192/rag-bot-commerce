'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { PDFParse } = require('pdf-parse');
const { chunkText } = require('./chunker');

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES } });

const IMAGE_DATA_URI_RE = /^data:image\/(jpeg|png);base64,/;
const IMAGE_MIMETYPES = { 'image/jpeg': true, 'image/png': true };
const PDF_MIMETYPE = 'application/pdf';
const VISION_EXTRACT_SYSTEM_PROMPT =
  'Ban la cong cu trich xuat noi dung tai lieu tu anh. Doc toan bo chu va thong tin trong anh ' +
  '(ten mon, gia, mo ta, ghi chu...) va chep lai chinh xac, day du thanh van ban thuan. ' +
  'Khong dinh dang markdown, khong them binh luan hay giai thich.';

class DocumentProcessingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function processDocumentBuffer({
  tenantId,
  filename,
  mimetype,
  buffer,
  llmClient,
  embeddingClient,
  vectorStore,
  tenantStore,
}) {
  const docId = `${filename}_${Date.now()}`;
  let text;
  if (IMAGE_MIMETYPES[mimetype]) {
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
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
      throw new DocumentProcessingError(422, `khong the doc noi dung anh: ${err.message}`);
    }
    if (!text || !text.trim()) {
      throw new DocumentProcessingError(422, 'anh khong co noi dung doc duoc');
    }
  } else if (mimetype === PDF_MIMETYPE) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text;
    } catch (err) {
      throw new DocumentProcessingError(422, `khong the doc file pdf: ${err.message}`);
    } finally {
      await parser.destroy();
    }
    if (!text || !text.trim()) {
      throw new DocumentProcessingError(
        422,
        'khong tim thay chu trong file pdf (co the la pdf dang anh scan, hay thu chup anh tung trang va upload anh thay the)'
      );
    }
  } else {
    text = buffer.toString('utf8');
  }

  const chunks = chunkText(text);
  let embeddings;
  try {
    embeddings = await embeddingClient.embed(chunks);
  } catch (err) {
    throw new DocumentProcessingError(502, `khong tao duoc embedding: ${err.message}`);
  }
  await vectorStore.addChunks(
    tenantId,
    chunks.map((chunkContent, i) => ({ text: chunkContent, embedding: embeddings[i], docId }))
  );
  tenantStore.addDocument({ id: docId, tenantId, filename, chunkCount: chunks.length });
  return { docId, chunkCount: chunks.length };
}

function createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient }) {
  const app = express();
  app.use(cors());
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

      const result = await processDocumentBuffer({
        tenantId: req.params.id,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        buffer: req.file.buffer,
        llmClient,
        embeddingClient,
        vectorStore,
        tenantStore,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof DocumentProcessingError) return res.status(err.status).json({ error: err.message });
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
