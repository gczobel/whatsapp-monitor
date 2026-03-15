import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { join } from 'node:path';
import { runMigrations } from './migrations.js';

export type { Database };

export function openDatabase(dataPath: string): Database {
  const db = new BetterSqlite3(join(dataPath, 'monitor.db'));

  // WAL mode gives significantly better read concurrency for SQLite.
  db.pragma('journal_mode = WAL');

  // Enforce foreign key constraints — SQLite disables them by default.
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}
