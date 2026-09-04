# Backend Vision Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image ("vision") support to the already-shipped `backend/` — a customer can send a photo alongside a chat question and get it factored into that one reply, and an admin can upload a photo of a menu/document and have its content permanently indexed like any other tenant document.

**Architecture:** No new files, no new services. `backend/` already calls OpenRouter (`src/llm.js`) with an arbitrary `messages` array — OpenAI-compatible chat APIs already allow a message's `content` to be either a plain string or an array of `{type, ...}` parts, so `llm.js` needs **zero changes**: the callers (`rag.js`, `app.js`) simply build a `content` array (text part + `image_url` part) instead of a plain string when an image is present. Two independent, already-scoped flows: (1) `POST /tenants/:id/ask` accepts an optional per-turn image, forwarded to the LLM but never persisted; (2) `POST /tenants/:id/documents` accepts image uploads, runs one vision LLM call to transcribe the image to text, then reuses the exact existing chunk→embed→index pipeline unchanged.

**Tech Stack:** Same as `backend/` (Node.js, Express, `better-sqlite3`, `@lancedb/lancedb`, native `fetch`, `node:test` + `supertest`). No new dependencies.

**Spec:** `docs/specs/2026-09-04-zalo-rag-bot-design.md` (see "Xử lý ảnh (Vision)" section)

## Global Constraints

- Verified 2026-09-04 via OpenRouter's live `GET /api/v1/models` endpoint: the backend's current default model, `minimax/minimax-m3:free`, has `architecture.input_modalities: ["text","image","video"]` and `pricing.prompt: "0"` — it already supports image input at no cost. **No model change needed**; `src/llm.js`'s default stays `minimax/minimax-m3:free`.
- Verified 2026-09-04 against OpenRouter's multimodal docs (`openrouter.ai/docs/guides/overview/multimodal/image-understanding`): a vision message's `content` is an array of parts — `{type:'text', text}` and `{type:'image_url', image_url:{url}}` — where `url` accepts either a public HTTP(S) link or a base64 data URI (`data:image/jpeg;base64,...`). Supported image types include `image/jpeg` and `image/png`. This plan restricts uploads/attachments to jpg/png only, per the approved spec's scope.
- An image sent with a chat `/ask` request is used **only** for that one LLM call — never written to LanceDB, never written to SQLite. Only the plain `text` (never the image) is saved via `TenantStore.addMessage`.
- An image uploaded via `/tenants/:id/documents` is converted to text once (via the vision LLM) and then indexed through the **exact same** `chunkText` → `embed` → `vectorStore.addChunks` pipeline already used for `.md`/`.txt` — no parallel/duplicate indexing path.
- Max image size: 5MB, enforced via multer's `limits.fileSize` on the upload path and Express's JSON body `limit` on the chat path (base64 inflates raw bytes by ~4/3, plus JSON envelope overhead — the JSON limit is set to `10mb` to comfortably cover a 5MB image).
- Non-image, non-jpg/png attachments (video, sticker, other files) are explicitly out of scope — not handled by this plan.

---

### Task 1: `/ask` accepts an optional per-turn image

**Files:**
- Modify: `backend/src/rag.js`
- Modify: `backend/src/app.js`
- Test: `backend/test/rag.test.js`
- Test: `backend/test/app.test.js`

**Interfaces:**
- Consumes: `RagService` constructor and all fields unchanged from the existing implementation (`tenantStore`, `vectorStore`, `embeddingClient`, `llmClient`).
- Produces: `RagService.answer({ tenantId, conversationId, text, image })` — `image` is a new **optional** 5th field (`string | undefined`, a `data:image/jpeg;base64,...` or `data:image/png;base64,...` URI). When present, the current turn's message sent to `llmClient.complete` has `content` as an array (`[{type:'text',...}, {type:'image_url',...}]`) instead of a plain string. Behavior is unchanged when `image` is omitted. `POST /tenants/:id/ask` now accepts an optional `image` field in its JSON body, validated with a `data:image/(jpeg|png);base64,` prefix check before it reaches `RagService`.

- [ ] **Step 1: Write the failing test for `rag.js`**

Add to `backend/test/rag.test.js` (after the existing `'answer saves both the user message and the assistant reply'` test):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/rag.test.js`
Expected: FAIL — `currentMessage.content` is currently the plain string `'day la mon gi?'`, not an array, so the `assert.deepEqual` fails.

- [ ] **Step 3: Implement the image branch in `rag.js`**

In `backend/src/rag.js`, replace the `answer` method body from the `contextBlock` line onward with:

```js
  async answer({ tenantId, conversationId, text, image }) {
    const tenant = this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`tenant not found: ${tenantId}`);
    }

    const [queryEmbedding] = await this.embeddingClient.embed([text]);
    const matches = await this.vectorStore.search(tenantId, queryEmbedding, 5);
    const context = matches.map((m) => m.text).join('\n\n');

    const history = this.tenantStore
      .getRecentMessages(tenantId, conversationId, HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.text }));

    const contextBlock = context
      ? `Thong tin tham khao:\n${context}\n\nCau hoi cua khach: ${text}`
      : text;

    const currentMessage = image
      ? {
          role: 'user',
          content: [
            { type: 'text', text: contextBlock },
            { type: 'image_url', image_url: { url: image } },
          ],
        }
      : { role: 'user', content: contextBlock };

    const reply = await this.llmClient.complete({
      systemPrompt: tenant.systemPrompt,
      messages: [...history, currentMessage],
    });

    this.tenantStore.addMessage({ tenantId, conversationId, role: 'user', text });
    this.tenantStore.addMessage({ tenantId, conversationId, role: 'assistant', text: reply });

    return reply;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/rag.test.js`
Expected: PASS (all rag.test.js tests, including the 4 pre-existing ones)

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/rag.js test/rag.test.js
git commit -m "feat(backend): RagService.answer accepts an optional per-turn image"
```

- [ ] **Step 6: Write the failing tests for the `/ask` route**

In `backend/test/app.test.js`, replace the `makeApp` helper with this extended version (adds `completeCalls` capture, needed to assert on what was sent to the LLM):

```js
function makeApp({ searchResults = [], llmReply = 'ok', embedTexts = null, completeCalls = null } = {}) {
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
  const llmClient = {
    complete: async (args) => {
      if (completeCalls) completeCalls.push(args);
      return llmReply;
    },
  };
  const { RagService } = require('../src/rag');
  const ragService = new RagService({ tenantStore, vectorStore, embeddingClient, llmClient });
  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService });
  return { app, tenantStore, vectorStore, embeddingClient };
}
```

Then add these two tests after the existing `'POST /tenants/:id/ask returns 404 for an unknown tenant'` test:

```js
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
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd backend && node --test test/app.test.js`
Expected: FAIL — `/ask` doesn't read `req.body.image` yet, so the first new test's `image_url` assertion fails; the second new test gets 200 instead of 400 (no validation exists yet).

- [ ] **Step 8: Implement the `/ask` route change and bump the JSON body limit**

In `backend/src/app.js`:

1. Change `app.use(express.json());` to `app.use(express.json({ limit: '10mb' }));` (default is 100kb — too small for a base64-encoded image).
2. Add this constant near the top of the file, after the `const upload = ...` line:

```js
const IMAGE_DATA_URI_RE = /^data:image\/(jpeg|png);base64,/;
```

3. Replace the `/tenants/:id/ask` route handler with:

```js
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
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd backend && node --test test/app.test.js`
Expected: PASS (all app.test.js tests, including the 8 pre-existing ones)

- [ ] **Step 10: Run the full suite**

Run: `cd backend && npm test`
Expected: PASS, all tests (37 pre-existing + 3 new = 40)

- [ ] **Step 11: Commit**

```bash
cd backend
git add src/app.js test/app.test.js
git commit -m "feat(backend): POST /tenants/:id/ask accepts an optional image"
```

---

### Task 2: `/tenants/:id/documents` accepts image uploads (vision-extracted, then indexed like any other document)

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/index.js`
- Modify: `backend/README.md`
- Test: `backend/test/app.test.js`

**Interfaces:**
- Consumes: `LLMClient.complete({systemPrompt, messages})` (unchanged signature from Task 1 / the original plan — a vision-shaped `messages` array works because `llm.js` already passes `content` through as-is).
- Produces: `createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient })` — **`llmClient` is a new required 5th field**, used only by the image branch of `POST /tenants/:id/documents`. `index.js` must pass it. `POST /tenants/:id/documents` behavior for `.md`/`.txt` (any non-`image/jpeg`/`image/png` mimetype) is unchanged; for `image/jpeg`/`image/png` uploads, the response is identical on success (`{docId, chunkCount}`, 201) but the route now also returns `422` if the vision LLM call fails or extracts no usable text.

- [ ] **Step 1: Write the failing tests**

In `backend/test/app.test.js`, extend `makeApp` once more to allow a full `llmClient` override (needed to simulate vision-extraction success/failure independently of the chat-completion `llmReply`/`completeCalls` params from Task 1):

```js
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
  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient });
  return { app, tenantStore, vectorStore, embeddingClient };
}
```

Then add these three tests after the existing `'POST /tenants/:id/documents returns 404 for an unknown tenant'` test:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test test/app.test.js`
Expected: FAIL — `createApp` doesn't accept/use `llmClient` yet, and `/documents` has no image branch, so uploaded jpg bytes are read as raw (garbled) UTF-8 text instead of being vision-extracted; the 422 tests get 201 instead.

- [ ] **Step 3: Implement the image branch in `app.js`**

In `backend/src/app.js`:

1. Add the multer size limit — change:
```js
const upload = multer({ storage: multer.memoryStorage() });
```
to:
```js
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
```

2. Add `llmClient` to the `createApp` destructured parameter:
```js
function createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient }) {
```

3. Add this constant near `IMAGE_DATA_URI_RE` (from Task 1):
```js
const IMAGE_MIMETYPES = { 'image/jpeg': true, 'image/png': true };
const VISION_EXTRACT_SYSTEM_PROMPT =
  'Ban la cong cu trich xuat noi dung tai lieu tu anh. Doc toan bo chu va thong tin trong anh ' +
  '(ten mon, gia, mo ta, ghi chu...) va chep lai chinh xac, day du thanh van ban thuan. ' +
  'Khong dinh dang markdown, khong them binh luan hay giai thich.';
```

4. Replace the `/tenants/:id/documents` route handler with:

```js
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
      res.status(201).json({ docId, chunkCount: chunks.length });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 4: Update `index.js` to pass `llmClient` into `createApp`**

In `backend/index.js`, change:
```js
  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService });
```
to:
```js
  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && node --test test/app.test.js`
Expected: PASS (all app.test.js tests, including the pre-existing and Task 1's)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && npm test`
Expected: PASS, all tests (40 from Task 1 + 3 new = 43)

- [ ] **Step 7: Update the README**

In `backend/README.md`, replace the `## API` section's `documents`/`ask` lines with:

```markdown
- `POST /tenants/:id/documents` (multipart, field `file`) → upload + index tài liệu. `.md`/`.txt`: đọc trực tiếp. `.jpg`/`.png`: trích xuất nội dung qua vision LLM trước khi index (tối đa 5MB, trả `422` nếu không đọc được ảnh)
- `POST /tenants/:id/ask` `{conversationId, text, image?}` → `{reply}` (`image`: base64 data URI `data:image/jpeg;base64,...` hoặc `data:image/png;base64,...`, tuỳ chọn — chỉ dùng cho lượt trả lời này, không lưu vào kho tài liệu)
```

Also update the `LLM_MODEL` line in the optional-env-vars section to:
```markdown
- `LLM_MODEL` — mặc định `minimax/minimax-m3:free` (model free trên OpenRouter, đã verify hoạt động và hỗ trợ input ảnh — `input_modalities: text+image+video`, xác minh qua OpenRouter models API ngày 2026-09-04).
```

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/app.js index.js README.md test/app.test.js
git commit -m "feat(backend): POST /tenants/:id/documents accepts jpg/png image uploads via vision extraction"
```
