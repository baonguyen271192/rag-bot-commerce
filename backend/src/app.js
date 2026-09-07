'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { PDFParse } = require('pdf-parse');
const { chunkText } = require('./chunker');

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES } });

const IMAGE_DATA_URI_RE = /^data:image\/(jpeg|png);base64,/;
const IMAGE_MIMETYPES = { 'image/jpeg': true, 'image/png': true };
const IMAGE_EXTENSION_BY_MIMETYPE = { 'image/jpeg': '.jpg', 'image/png': '.png' };
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

// Renders each PDF page as a PNG and chunks each page's text separately (rather than
// chunking the whole concatenated document), so every resulting chunk can be tagged with
// the exact page it came from -- that's what lets the bot later attach the real page
// image, not just a text answer, when that chunk is the best match for a question.
async function extractPdfPages(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    // getText() and getScreenshot() must run sequentially, not concurrently -- calling
    // both at once on the same parser corrupts pdf-parse's internal worker postMessage
    // ("Cannot transfer object of unsupported type"), reproduced with a real PDFParse
    // instance before landing on this fix.
    const textResult = await parser.getText();
    const screenshotResult = await parser.getScreenshot({ scale: 1.5 });
    return textResult.pages.map((p, i) => ({ num: p.num, text: p.text, image: screenshotResult.pages[i].data }));
  } finally {
    await parser.destroy();
  }
}

function writeDocumentFile(documentsDir, tenantId, docId, relativeName, data) {
  const dir = path.join(documentsDir, tenantId, docId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, relativeName), data);
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
  documentsDir,
}) {
  const docId = `${filename}_${Date.now()}`;
  // { text, page }[] -- page is 0 for plain text/markdown docs, which never have an
  // image to attach; 1 for a single uploaded image; 1..N for each PDF page.
  let pages;

  if (IMAGE_MIMETYPES[mimetype]) {
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
    let text;
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
    writeDocumentFile(documentsDir, tenantId, docId, `original${IMAGE_EXTENSION_BY_MIMETYPE[mimetype]}`, buffer);
    pages = [{ text, page: 1 }];
  } else if (mimetype === PDF_MIMETYPE) {
    let pdfPages;
    try {
      pdfPages = await extractPdfPages(buffer);
    } catch (err) {
      throw new DocumentProcessingError(422, `khong the doc file pdf: ${err.message}`);
    }
    if (!pdfPages.some((p) => p.text && p.text.trim())) {
      throw new DocumentProcessingError(
        422,
        'khong tim thay chu trong file pdf (co the la pdf dang anh scan, hay thu chup anh tung trang va upload anh thay the)'
      );
    }
    for (const p of pdfPages) {
      writeDocumentFile(documentsDir, tenantId, docId, `page-${p.num}.png`, Buffer.from(p.image));
    }
    pages = pdfPages.map((p) => ({ text: p.text, page: p.num }));
  } else {
    pages = [{ text: buffer.toString('utf8'), page: 0 }];
  }

  const chunks = pages.flatMap((p) => chunkText(p.text).map((chunkContent) => ({ text: chunkContent, page: p.page })));
  let embeddings;
  try {
    embeddings = await embeddingClient.embed(chunks.map((c) => c.text));
  } catch (err) {
    throw new DocumentProcessingError(502, `khong tao duoc embedding: ${err.message}`);
  }
  await vectorStore.addChunks(
    tenantId,
    chunks.map((c, i) => ({ text: c.text, embedding: embeddings[i], docId, page: c.page }))
  );
  tenantStore.addDocument({ id: docId, tenantId, filename, chunkCount: chunks.length, mimetype });
  return { docId, chunkCount: chunks.length };
}

function createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient, documentsDir }) {
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
        documentsDir,
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
      fs.rmSync(path.join(documentsDir, req.params.id, req.params.docId), { recursive: true, force: true });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.get('/tenants/:id/documents/:docId/image', (req, res) => {
    const doc = tenantStore.getDocument(req.params.docId);
    if (!doc || doc.tenantId !== req.params.id) return res.status(404).json({ error: 'document not found' });

    let relativeName;
    let contentType;
    if (doc.mimetype === PDF_MIMETYPE) {
      const page = parseInt(req.query.page, 10);
      if (!page) return res.status(400).json({ error: 'page query param is required for a pdf document' });
      relativeName = `page-${page}.png`;
      contentType = 'image/png';
    } else if (IMAGE_EXTENSION_BY_MIMETYPE[doc.mimetype]) {
      relativeName = `original${IMAGE_EXTENSION_BY_MIMETYPE[doc.mimetype]}`;
      contentType = doc.mimetype;
    } else {
      return res.status(404).json({ error: 'this document has no image to serve' });
    }

    const filePath = path.join(documentsDir, req.params.id, req.params.docId, relativeName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'image not found' });
    res.setHeader('Content-Type', contentType);
    res.sendFile(filePath);
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

      const { reply, attachment } = await ragService.answer({
        tenantId: req.params.id,
        conversationId: req.body.conversationId,
        text: req.body.text,
        image,
      });
      res.json({ reply, attachment });
    } catch (err) {
      next(err);
    }
  });

  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'file qua lon (toi da 20MB)' });
    }
    console.error('backend: unhandled route error', err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
