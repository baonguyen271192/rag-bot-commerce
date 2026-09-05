'use strict';

const Database = require('better-sqlite3');

class TenantStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv
        ON messages (tenant_id, conversation_id, id);
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        chunk_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_tenant
        ON documents (tenant_id, created_at);
    `);
  }

  createTenant({ id, name, systemPrompt }) {
    const createdAt = new Date().toISOString();
    this.db
      .prepare('INSERT INTO tenants (id, name, system_prompt, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, systemPrompt, createdAt);
    return { id, name, systemPrompt, createdAt };
  }

  getTenant(id) {
    const row = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!row) return null;
    return { id: row.id, name: row.name, systemPrompt: row.system_prompt, createdAt: row.created_at };
  }

  listTenants() {
    const rows = this.db.prepare('SELECT * FROM tenants ORDER BY created_at ASC').all();
    return rows.map((row) => ({ id: row.id, name: row.name, systemPrompt: row.system_prompt, createdAt: row.created_at }));
  }

  updateTenantPrompt(id, systemPrompt) {
    this.db.prepare('UPDATE tenants SET system_prompt = ? WHERE id = ?').run(systemPrompt, id);
  }

  addMessage({ tenantId, conversationId, role, text }) {
    this.db
      .prepare('INSERT INTO messages (tenant_id, conversation_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(tenantId, conversationId, role, text, new Date().toISOString());
  }

  getRecentMessages(tenantId, conversationId, limit) {
    const rows = this.db
      .prepare(
        `SELECT role, text FROM messages
         WHERE tenant_id = ? AND conversation_id = ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(tenantId, conversationId, limit);
    return rows.reverse();
  }

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

  close() {
    this.db.close();
  }
}

module.exports = { TenantStore };
