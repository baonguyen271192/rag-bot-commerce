'use strict';

const Database = require('better-sqlite3');

class ThreadStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mappings (
        zalo_user_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  getThreadId(zaloUserId) {
    const row = this.db.prepare('SELECT thread_id FROM mappings WHERE zalo_user_id = ?').get(zaloUserId);
    return row ? row.thread_id : null;
  }

  saveThreadId(zaloUserId, threadId) {
    this.db
      .prepare('INSERT INTO mappings (zalo_user_id, thread_id, created_at) VALUES (?, ?, ?) ON CONFLICT(zalo_user_id) DO UPDATE SET thread_id = excluded.thread_id')
      .run(zaloUserId, threadId, new Date().toISOString());
  }

  close() {
    this.db.close();
  }
}

module.exports = { ThreadStore };
