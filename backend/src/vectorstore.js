'use strict';

const lancedb = require('@lancedb/lancedb');

class VectorStore {
  constructor({ dbPath }) {
    this.dbPath = dbPath;
    this.dbPromise = lancedb.connect(dbPath);
    this.tableCache = new Map();
  }

  _tableName(tenantId) {
    return `tenant_${tenantId}`;
  }

  async _openExistingTable(tenantId) {
    const cached = this.tableCache.get(tenantId);
    if (cached) return cached;

    const db = await this.dbPromise;
    const tableName = this._tableName(tenantId);
    const existing = await db.tableNames();
    if (!existing.includes(tableName)) return null;

    const table = await db.openTable(tableName);
    this.tableCache.set(tenantId, table);
    return table;
  }

  // Tables created before the `page` column existed reject inserts of rows that carry
  // it ("Found field not in schema: page") -- backfill those tables in place instead of
  // requiring a manual migration. CAST(0 AS INT) (not the bare SQL literal `0`, which
  // LanceDB infers as int64/BigInt) keeps the backfilled column's type identical to what
  // a fresh table infers from a plain JS number, so `page` is always a plain `number`
  // coming back out of search() -- a BigInt would blow up JSON.stringify in the /ask route.
  async _ensurePageColumn(table) {
    const fieldNames = (await table.schema()).fields.map((f) => f.name);
    if (!fieldNames.includes('page')) {
      await table.addColumns([{ name: 'page', valueSql: 'CAST(0 AS INT)' }]);
    }
  }

  async addChunks(tenantId, chunks) {
    if (!chunks || chunks.length === 0) return;

    const rows = chunks.map((c, i) => ({
      id: `${c.docId}_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
      text: c.text,
      vector: c.embedding,
      docId: c.docId,
      // 0 means "no page image for this chunk" (plain text docs) -- kept as a plain
      // integer, never null, so LanceDB's schema inference from the first insert
      // doesn't have to deal with a nullable column.
      page: c.page || 0,
    }));

    let table = this.tableCache.get(tenantId);
    if (table) {
      await this._ensurePageColumn(table);
      await table.add(rows);
      return;
    }

    const db = await this.dbPromise;
    const tableName = this._tableName(tenantId);
    const existing = await db.tableNames();
    if (existing.includes(tableName)) {
      table = await db.openTable(tableName);
      await this._ensurePageColumn(table);
      await table.add(rows);
    } else {
      // First insert for this tenant: createTable infers the schema from
      // the rows themselves, so no throwaway sample row is needed.
      table = await db.createTable(tableName, rows);
    }
    this.tableCache.set(tenantId, table);
  }

  async search(tenantId, queryEmbedding, k = 5) {
    const table = await this._openExistingTable(tenantId);
    if (!table) return [];

    const results = await table.search(queryEmbedding).limit(k).toArray();
    return results.map((r) => ({ text: r.text, score: r._distance, docId: r.docId, page: r.page }));
  }

  async deleteDocument(tenantId, docId) {
    const table = await this._openExistingTable(tenantId);
    if (!table) return;

    const escapedDocId = docId.replace(/'/g, "''");
    await table.delete(`docId = '${escapedDocId}'`);
  }

  async close() {
    // LanceDB connections/tables don't require explicit closing — they are
    // released automatically on garbage collection. Kept for interface
    // symmetry with callers that want a clean async shutdown hook.
  }
}

module.exports = { VectorStore };
