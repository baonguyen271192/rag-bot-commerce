# Backend Gemini Embedding Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Gemini as a second, swappable embedding provider for the already-shipped `backend/`, selected at startup via an `EMBEDDING_PROVIDER` env var (default `openai`, unchanged). Motivation: OpenAI's embeddings API requires a funded billing account (a card, minimum $5 purchase) even for a few cents of usage — a real blocker for local testing before any paying customer exists. Gemini's embedding API has a genuinely free tier with no card required, letting testing proceed now; switching back to OpenAI later (e.g. for a production tenant) requires zero code changes, only an env var flip.

**Architecture:** `backend/src/embeddings.js` already exports one class, `EmbeddingClient` (OpenAI). This plan adds a second class, `GeminiEmbeddingClient`, in the same file, implementing the exact same `async embed(texts: string[]): Promise<number[][]>` interface that `RagService`/`app.js`'s upload route already depend on — so nothing outside `embeddings.js` and `index.js`'s composition logic needs to know or care which provider is active. `index.js` picks the class to instantiate based on `EMBEDDING_PROVIDER`, and only requires the API key env var that the selected provider actually needs (today it unconditionally requires `OPENAI_API_KEY`, which would break Gemini-only setups).

**Tech Stack:** Same as `backend/` (Node.js, native `fetch`, `node:test`). No new dependencies — Gemini's REST API needs nothing beyond `fetch`, same as the existing OpenAI/OpenRouter clients.

**Spec:** No existing spec document covers this (it's an operational/deployment concern, not a product feature) — this plan is scoped directly from the conversation that identified the need.

## Global Constraints

- **Verified 2026-09-07 against Google's live API documentation** (not guessed): Gemini's batch embedding endpoint is `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents`, request body `{requests: [{model: "models/<model>", content: {parts: [{text}]}}, ...]}`, response body `{embeddings: [{values: number[], shape}, ...], usageMetadata: {...}}`, and Google's own docs state explicitly: "The responses will be in the same order as the input requests" — no index-based re-sorting needed (unlike OpenAI's response, which requires sorting by an `index` field, already handled correctly in the existing `EmbeddingClient`).
- **Verified 2026-09-07**: `gemini-embedding-001` is Google's current, stable, generally-available **text-only** embedding model (a separate newer model, `gemini-embedding-2`, is multimodal — not needed here since this project only embeds text/markdown document chunks and vision-extracted text, never raw images directly). Default output dimension is 3072.
- **[Unverified] carried forward for the implementer to confirm against a real key**: authentication via the `x-goog-api-key` HTTP header was confirmed for Gemini's single-item `embedContent` endpoint; this plan assumes (standard, consistent across the whole `generativelanguage.googleapis.com` API surface) that `batchEmbedContents` uses the identical header — but this was not independently fetched/confirmed for the batch endpoint specifically. Confirm this works during Task 1's implementation (a real Gemini API key will be available for this testing per the calling context), and if the batch endpoint actually needs a different auth mechanism, fix it then and note the correction in your report.
- `EMBEDDING_PROVIDER` defaults to `openai` — every existing deployment/test that doesn't set this env var must behave exactly as it does today. This is the load-bearing backward-compatibility guarantee of this whole plan.
- Only the API key env var the *selected* provider actually needs should be required at startup — a Gemini-only setup must not be blocked by a missing `OPENAI_API_KEY`, and vice versa.

---

### Task 1: `GeminiEmbeddingClient` in `embeddings.js`

**Files:**
- Modify: `backend/src/embeddings.js`
- Modify: `backend/test/embeddings.test.js`

**Interfaces:**
- Produces: `class GeminiEmbeddingClient` with `constructor({ apiKey, model = 'gemini-embedding-001', fetchImpl = fetch })`, `async embed(texts: string[]): Promise<number[][]>` — same shape as the existing `EmbeddingClient`, so both are interchangeable wherever an `embeddingClient` is passed (`RagService`, `app.js`'s upload route). Used by Task 2 (`index.js`).

- [ ] **Step 1: Write the failing tests**

Add to `backend/test/embeddings.test.js` (after the existing 4 `EmbeddingClient` tests, importing the new class too — change the top `require` line from `const { EmbeddingClient } = require('../src/embeddings');` to `const { EmbeddingClient, GeminiEmbeddingClient } = require('../src/embeddings');`):

```js
test('GeminiEmbeddingClient.embed posts to the batchEmbedContents endpoint with the configured model and returns vectors in order', async () => {
  let capturedUrl;
  let capturedBody;
  let capturedHeaders;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    capturedHeaders = init.headers;
    return {
      ok: true,
      json: async () => ({
        embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
      }),
    };
  };
  const client = new GeminiEmbeddingClient({ apiKey: 'test-key', fetchImpl: fakeFetch });

  const vectors = await client.embed(['hello', 'world']);

  assert.equal(
    capturedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents'
  );
  assert.equal(capturedHeaders['x-goog-api-key'], 'test-key');
  assert.deepEqual(capturedBody, {
    requests: [
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'hello' }] } },
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'world' }] } },
    ],
  });
  assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
});

test('GeminiEmbeddingClient.embed preserves response order as returned by the API (no re-sorting needed)', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ embeddings: [{ values: [1, 1] }, { values: [9, 9] }] }),
  });
  const client = new GeminiEmbeddingClient({ apiKey: 'k', fetchImpl: fakeFetch });
  const vectors = await client.embed(['a', 'b']);
  assert.deepEqual(vectors, [[1, 1], [9, 9]]);
});

test('GeminiEmbeddingClient.embed throws a clear error when the API responds with a non-ok status', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid api key' });
  const client = new GeminiEmbeddingClient({ apiKey: 'bad-key', fetchImpl: fakeFetch });
  await assert.rejects(() => client.embed(['x']), /401/);
});

test('GeminiEmbeddingClient.embed returns an empty array for empty input without calling fetch', async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return { ok: true, json: async () => ({ embeddings: [] }) };
  };
  const client = new GeminiEmbeddingClient({ apiKey: 'k', fetchImpl: fakeFetch });
  const vectors = await client.embed([]);
  assert.deepEqual(vectors, []);
  assert.equal(called, false);
});

test('GeminiEmbeddingClient.embed uses the configured model override', async () => {
  let capturedUrl;
  let capturedBody;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ embeddings: [{ values: [1] }] }) };
  };
  const client = new GeminiEmbeddingClient({ apiKey: 'k', model: 'gemini-embedding-2', fetchImpl: fakeFetch });
  await client.embed(['x']);
  assert.equal(
    capturedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents'
  );
  assert.equal(capturedBody.requests[0].model, 'models/gemini-embedding-2');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test test/embeddings.test.js`
Expected: FAIL with `GeminiEmbeddingClient is not a constructor` (or `undefined`)

- [ ] **Step 3: Implement `GeminiEmbeddingClient`**

In `backend/src/embeddings.js`, add this class after the existing `EmbeddingClient` class (before `module.exports`), and update the exports line:

```js
class GeminiEmbeddingClient {
  constructor({ apiKey, model = 'gemini-embedding-001', fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }

  async embed(texts) {
    if (texts.length === 0) return [];
    const res = await this.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${this.model}`,
            content: { parts: [{ text }] },
          })),
        }),
      }
    );
    if (!res.ok) {
      const detail = res.text ? await res.text() : '';
      throw new Error(`Gemini embeddings request failed with status ${res.status}: ${detail}`);
    }
    const data = await res.json();
    return data.embeddings.map((item) => item.values);
  }
}
```

Change the final line of the file from:
```js
module.exports = { EmbeddingClient };
```
to:
```js
module.exports = { EmbeddingClient, GeminiEmbeddingClient };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/embeddings.test.js`
Expected: PASS (9/9 — 4 pre-existing `EmbeddingClient` tests + 5 new `GeminiEmbeddingClient` tests)

- [ ] **Step 5: Run the full suite**

Run: `cd backend && npm test`
Expected: PASS, all 59 tests (54 baseline + 5 new)

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/embeddings.js test/embeddings.test.js
git commit -m "feat(backend): add GeminiEmbeddingClient as an alternate embedding provider"
```

---

### Task 2: Provider selection in `index.js` + README

**Files:**
- Modify: `backend/index.js`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: `GeminiEmbeddingClient` (Task 1).
- Produces: no change to any exported interface — `index.js` is the composition root, not imported by anything else. New env vars: `EMBEDDING_PROVIDER` (optional, `openai` or `gemini`, default `openai`), `GEMINI_API_KEY` (required only when `EMBEDDING_PROVIDER=gemini`).

- [ ] **Step 1: Update `index.js`**

Replace the full contents of `backend/index.js`:

```js
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { TenantStore } = require('./src/db');
const { VectorStore } = require('./src/vectorstore');
const { EmbeddingClient, GeminiEmbeddingClient } = require('./src/embeddings');
const { LLMClient } = require('./src/llm');
const { RagService } = require('./src/rag');
const { createApp } = require('./src/app');

function createEmbeddingClient(provider) {
  if (provider === 'gemini') {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY env var is required when EMBEDDING_PROVIDER=gemini');
    }
    return new GeminiEmbeddingClient({ apiKey: geminiApiKey });
  }
  if (provider === 'openai') {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY env var is required when EMBEDDING_PROVIDER=openai (the default)');
    }
    return new EmbeddingClient({ apiKey: openaiApiKey });
  }
  throw new Error(`Unknown EMBEDDING_PROVIDER: "${provider}" (expected "openai" or "gemini")`);
}

function main() {
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY env var is required');
  }

  const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'openai';
  const embeddingClient = createEmbeddingClient(embeddingProvider);

  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'tenants.db');
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const tenantStore = new TenantStore(sqlitePath);
  const vectorStore = new VectorStore({ dbPath: process.env.LANCE_PATH || path.join(__dirname, 'data', 'vectors') });
  const llmClient = new LLMClient({
    apiKey: openrouterApiKey,
    model: process.env.LLM_MODEL || 'minimax/minimax-m3:free',
  });
  const ragService = new RagService({ tenantStore, vectorStore, embeddingClient, llmClient });

  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient });
  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`backend: listening on port ${port} (embedding provider: ${embeddingProvider})`);
  });
}

main();
```

No automated test for this file (same established precedent as the original backend plan's Task 8 — `index.js` is a thin composition root, verified by manual smoke test, not unit tests).

- [ ] **Step 2: Manual smoke test — both provider paths**

Verify the env-var validation logic actually works before relying on it, without needing a real network call for the negative cases:

```bash
cd backend
# Case 1: no EMBEDDING_PROVIDER set (default openai), missing OPENAI_API_KEY -> should throw the openai-specific message
OPENROUTER_API_KEY=x node -e "require('./index.js')" 2>&1 | head -5
# Case 2: EMBEDDING_PROVIDER=gemini, missing GEMINI_API_KEY -> should throw the gemini-specific message
EMBEDDING_PROVIDER=gemini OPENROUTER_API_KEY=x node -e "require('./index.js')" 2>&1 | head -5
# Case 3: EMBEDDING_PROVIDER=bogus -> should throw the "Unknown EMBEDDING_PROVIDER" message
EMBEDDING_PROVIDER=bogus OPENROUTER_API_KEY=x OPENAI_API_KEY=x node -e "require('./index.js')" 2>&1 | head -5
# Case 4 (only if a real GEMINI_API_KEY is available to you — see note below):
# EMBEDDING_PROVIDER=gemini with a real GEMINI_API_KEY and any placeholder OPENROUTER_API_KEY -> server should actually boot
EMBEDDING_PROVIDER=gemini GEMINI_API_KEY=<real key> OPENROUTER_API_KEY=x timeout 3 node index.js 2>&1 | head -5
```

Report the actual output of cases 1-3 (these need no real key and must all be checked for real). **Case 4 requires a real Gemini API key, which you may not have** — if none is available in your environment, do not fabricate one or skip silently: state plainly in your report that this specific check (a real network call to Gemini's `batchEmbedContents`, which is what would catch this plan's [Unverified] auth-header assumption from the Global Constraints) was NOT performed and remains outstanding, exactly like this project's established precedent for every other "needs a real external credential" gap (the original backend plan's Task 8, `bridge/`'s live-Zalo-account verification). If a real key IS available to you, run case 4 for real and report its actual output — if it fails with an auth error, investigate whether `batchEmbedContents` needs different authentication than `embedContent`, fix `GeminiEmbeddingClient` in Task 1's file accordingly, and note the correction in your report.

- [ ] **Step 3: Update the README**

In `backend/README.md`, update the "Biến môi trường bắt buộc" and "Biến môi trường tuỳ chọn" sections:

```markdown
## Biến môi trường bắt buộc

- `OPENROUTER_API_KEY` — dùng để gọi LLM trả lời.
- `OPENAI_API_KEY` — bắt buộc nếu `EMBEDDING_PROVIDER=openai` (mặc định). Dùng để tạo embedding (`text-embedding-3-small`).
- `GEMINI_API_KEY` — bắt buộc nếu `EMBEDDING_PROVIDER=gemini`. Dùng để tạo embedding (`gemini-embedding-001`).

## Biến môi trường tuỳ chọn

- `EMBEDDING_PROVIDER` — `openai` (mặc định) hoặc `gemini`. Chọn nhà cung cấp embedding — đổi qua lại chỉ cần đổi biến này, không cần sửa code. Gemini có gói miễn phí không cần thẻ, phù hợp giai đoạn test; OpenAI cần tài khoản có nạp tiền (tối thiểu $5).
- `PORT` — mặc định `4001`.
- `SQLITE_PATH` — mặc định `backend/data/tenants.db`.
- `LANCE_PATH` — mặc định `backend/data/vectors`.
- `LLM_MODEL` — mặc định `minimax/minimax-m3:free` (model free trên OpenRouter, đã verify hoạt động và hỗ trợ input ảnh — `input_modalities: text+image+video`, xác minh qua OpenRouter models API ngày 2026-09-04).
```

- [ ] **Step 4: Run the full suite one more time**

Run: `cd backend && npm test`
Expected: PASS, all 59 tests (unchanged from Task 1 — this task added no new automated tests, only manual smoke checks).

- [ ] **Step 5: Commit**

```bash
cd backend
git add index.js README.md
git commit -m "feat(backend): select embedding provider (openai/gemini) via EMBEDDING_PROVIDER env var"
```
