import { describe, it, expect } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../../src/db/migrations.js';

function freshDb(): ReturnType<typeof BetterSqlite3> {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('runMigrations', () => {
  it('should create the accounts table', () => {
    const db = freshDb();
    runMigrations(db);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'")
      .get();
    expect(row).toBeTruthy();
  });

  it('should create the messages table', () => {
    const db = freshDb();
    runMigrations(db);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
      .get();
    expect(row).toBeTruthy();
  });

  it('should create the scan_results table', () => {
    const db = freshDb();
    runMigrations(db);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_results'")
      .get();
    expect(row).toBeTruthy();
  });

  it('should be idempotent when run multiple times', () => {
    const db = freshDb();
    expect(() => {
      runMigrations(db);
      runMigrations(db);
    }).not.toThrow();
  });

  it('should enforce foreign key from messages to accounts', () => {
    const db = freshDb();
    runMigrations(db);
    expect(() => {
      db.prepare(
        `INSERT INTO messages (account_id, group_id, timestamp, sender, content)
         VALUES (999, 'group@g.us', '2026-01-01T00:00:00Z', 'X', 'Y')`,
      ).run();
    }).toThrow();
  });

  it('should enforce foreign key from scan_results to accounts', () => {
    const db = freshDb();
    runMigrations(db);
    expect(() => {
      db.prepare(
        `INSERT INTO scan_results (account_id, profile_id, timestamp, input_message_ids, output)
         VALUES (999, 'p1', '2026-01-01T00:00:00Z', '[]', 'out')`,
      ).run();
    }).toThrow();
  });

  it('should allow inserting an account with all nullable fields null', () => {
    const db = freshDb();
    runMigrations(db);
    expect(() => {
      db.prepare(`INSERT INTO accounts (id, display_name) VALUES (1, 'Test')`).run();
    }).not.toThrow();
  });
});
