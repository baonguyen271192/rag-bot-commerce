# Backend Document Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two document-management routes the design spec always specified but the original backend plan's Task 7 silently narrowed away — `GET /tenants/:id/documents` (list) and `DELETE /tenants/:id/documents/:docId` (delete) — so `admin-ui/` (the next plan) can show and remove a tenant's uploaded documents.

**Architecture:** `backend/` currently has no record of which documents were uploaded — `POST /tenants/:id/documents` chunks/embeds/indexes a file into LanceDB but never persists the upload itself anywhere queryable. Add a `documents` table to the existing SQLite database (`src/db.js`, same file as `tenants`/`messages`) to track `{id, tenantId, filename, chunkCount, createdAt}` per upload, write to it from the existing upload route, and add the two new routes on top of it. `vectorStore.deleteDocument(tenantId, docId)` (the LanceDB deletion) already exists and is already tested (from the original backend plan) — this plan only adds the SQLite side and the two new HTTP routes.

**Tech Stack:** Same as `backend/` (Node.js, Express, `better-sqlite3`, `node:test` + `supertest`). No new dependencies.

**Spec:** `docs/specs/2026-09-04-zalo-rag-bot-design.md` (`src/routes/documents.js` row: "`GET /tenants/:id/documents` (liệt kê)")

## Global Constraints

- The `documents` table's primary key is the same `docId` string already generated in the upload route (`` `${req.file.originalname}_${Date.now()}` ``) — no new id scheme.
- `DELETE /tenants/:id/documents/:docId` must verify the document belongs to the tenant in the URL (not just that the document id exists somewhere) before deleting anything — same "don't trust the URL's tenant id alone" discipline already applied to every other route in this backend.
- Deleting a document must remove it from BOTH stores it lives in: LanceDB (via the already-existing `vectorStore.deleteDocument`) and the new SQLite `documents` table. A delete that only removes one would leave the two stores inconsistent (e.g., re-uploading a same-named file could look like a duplicate in one store but not the other).

---

### Task 1: `documents` table + `TenantStore` methods

**Files:**
- Modify: `backend/src/db.js`
- Modify: `backend/test/db.test.js`

**Interfaces:**
- Produces: `TenantStore.addDocument({ id, tenantId, filename, chunkCount }): void`, `TenantStore.listDocuments(tenantId): Array<{id, filename, chunkCount, createdAt}>` (oldest first), `TenantStore.getDocument(id): {id, tenantId, filename, chunkCount, createdAt} | null`, `TenantStore.deleteDocument(id): void`. Used by Task 2 (`app.js`'s new routes and the modified upload route).

- [ ] **Step 1: Write the failing tests**

Add to `backend/test/db.test.js` (after the existing `'messages are isolated per conversation'` test):

```js
test('adds and lists documents for a tenant, oldest first', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'menu.md_1', tenantId: 't1', filename: 'menu.md', chunkCount: 3 });
  store.addDocument({ id: 'info.md_2', tenantId: 't1', filename: 'info.md', chunkCount: 1 });

  const docs = store.listDocuments('t1');

  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.id), ['menu.md_1', 'info.md_2']);
  assert.equal(docs[0].filename, 'menu.md');
  assert.equal(docs[0].chunkCount, 3);
  assert.ok(docs[0].createdAt);
  store.close();
});

test('listDocuments only returns documents for the requested tenant', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.createTenant({ id: 't2', name: 'B', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'a.md', chunkCount: 1 });
  store.addDocument({ id: 'doc2', tenantId: 't2', filename: 'b.md', chunkCount: 1 });

  assert.deepEqual(store.listDocuments('t1').map((d) => d.id), ['doc1']);
  assert.deepEqual(store.listDocuments('t2').map((d) => d.id), ['doc2']);
  store.close();
});

test('getDocument returns the document with its tenantId, or null if missing', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'a.md', chunkCount: 2 });

  const doc = store.getDocument('doc1');
  assert.equal(doc.tenantId, 't1');
  assert.equal(doc.filename, 'a.md');
  assert.equal(store.getDocument('missing'), null);
  store.close();
});

test('deleteDocument removes the document row', () => {
  const store = new TenantStore(':memory:');
  store.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  store.addDocument({ id: 'doc1', tenantId: 't1', filename: 'a.md', chunkCount: 1 });

  store.deleteDocument('doc1');

  assert.equal(store.getDocument('doc1'), null);
  assert.deepEqual(store.listDocuments('t1'), []);
  store.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test test/db.test.js`
Expected: FAIL with `store.addDocument is not a function`

- [ ] **Step 3: Add the `documents` table and the 4 methods**

In `backend/src/db.js`, add `documents` to the `CREATE TABLE IF NOT EXISTS` block inside the constructor (after the existing `messages` table and its index, before the closing template-literal backtick):

```sql
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        chunk_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_tenant
        ON documents (tenant_id, created_at);
```

Then add these 4 methods to the `TenantStore` class (after `getRecentMessages`, before `close`):

```js
  addDocument({ id, tenantId, filename, chunkCount }) {
    this.db
      .prepare('INSERT INTO documents (id, tenant_id, filename, chunk_count, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, tenantId, filename, chunkCount, new Date().toISOString());
  }

  listDocuments(tenantId) {
    const rows = this.db
      .prepare('SELECT * FROM documents WHERE tenant_id = ? ORDER BY created_at ASC')
      .all(tenantId);
    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      chunkCount: row.chunk_count,
      createdAt: row.created_at,
    }));
  }

  getDocument(id) {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      filename: row.filename,
      chunkCount: row.chunk_count,
      createdAt: row.created_at,
    };
  }

  deleteDocument(id) {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/db.test.js`
Expected: PASS (10/10 — 6 pre-existing + 4 new)

- [ ] **Step 5: Run the full suite**

Run: `cd backend && npm test`
Expected: PASS, all tests (was 43 before this plan, now 47)

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/db.js test/db.test.js
git commit -m "feat(backend): add documents table and TenantStore CRUD methods"
```

---

### Task 2: `GET`/`DELETE` document routes + wire uploads into the new table

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/README.md`
- Test: `backend/test/app.test.js`

**Interfaces:**
- Consumes: `TenantStore.addDocument/listDocuments/getDocument/deleteDocument` (Task 1), `VectorStore.deleteDocument(tenantId, docId)` (already exists from the original backend plan, unchanged).
- Produces: `GET /tenants/:id/documents` → `200 [{id,filename,chunkCount,createdAt}]` (404 if tenant unknown). `DELETE /tenants/:id/documents/:docId` → `204` on success, `404` if the tenant or the document (or a document belonging to a *different* tenant) doesn't exist. `POST /tenants/:id/documents` (existing route) now also records the upload in the `documents` table on success — no change to its response shape.

- [ ] **Step 1: Write the failing tests**

Add to `backend/test/app.test.js` (after the existing `'POST /tenants/:id/documents returns 404 for an unknown tenant'` test):

```js
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
```

The `makeApp` test helper's fake `vectorStore` needs a `deleteDocument` spy and a `deletedDocuments` array to support the tests above. Update `makeApp` in `backend/test/app.test.js` — add to the `vectorStore` object literal (which already has `addedChunks`/`addChunks`/`search`):

```js
    deletedDocuments: [],
    deleteDocument: async function (tenantId, docId) {
      this.deletedDocuments.push({ tenantId, docId });
    },
```

`makeApp`'s `return { app, tenantStore, vectorStore, embeddingClient };` line already returns `vectorStore` — no change needed there, the tests above can destructure it directly (`const { app, vectorStore } = makeApp();`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test test/app.test.js`
Expected: FAIL — no `GET`/`DELETE` routes exist yet, and the upload route doesn't call `addDocument` yet.

- [ ] **Step 3: Wire the upload route + add the two new routes**

In `backend/src/app.js`, in the existing `POST /tenants/:id/documents` handler, add a call to `tenantStore.addDocument(...)` right before the `res.status(201).json(...)` line:

```js
      await vectorStore.addChunks(
        req.params.id,
        chunks.map((text, i) => ({ text, embedding: embeddings[i], docId }))
      );
      tenantStore.addDocument({ id: docId, tenantId: req.params.id, filename: req.file.originalname, chunkCount: chunks.length });
      res.status(201).json({ docId, chunkCount: chunks.length });
```

Then add these two new routes (place them right after the `POST /tenants/:id/documents` route, before `POST /tenants/:id/ask`):

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/app.test.js`
Expected: PASS (all app.test.js tests, pre-existing + 6 new)

- [ ] **Step 5: Run the full suite**

Run: `cd backend && npm test`
Expected: PASS, all 53 tests (43 baseline + 4 from Task 1 + 6 new in this task)

- [ ] **Step 6: Update the README**

In `backend/README.md`, add these two lines to the `## API` section, right after the existing `POST /tenants/:id/documents` line:

```markdown
- `GET /tenants/:id/documents` → danh sách tài liệu đã upload (`{id, filename, chunkCount, createdAt}[]`)
- `DELETE /tenants/:id/documents/:docId` → xoá tài liệu khỏi LanceDB và khỏi danh sách
```

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/app.js README.md test/app.test.js
git commit -m "feat(backend): add GET/DELETE document routes, record uploads in SQLite"
```
