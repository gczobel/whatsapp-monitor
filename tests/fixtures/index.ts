import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrations.js';
import type { NewMessage, Account } from '../../src/types.js';

/**
 * Creates an in-memory SQLite database with the full schema applied.
 * Use this in unit tests that need a real DB without touching the filesystem.
 */
export function createTestDatabase(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/**
 * Inserts a test account and returns it.
 */
export function seedAccount(db: Database, overrides: Partial<Account> = {}): Account {
  const account: Account = {
    id: 1,
    displayName: 'Test User',
    phoneNumber: '972501234567',
    monitoredGroupId: null,
    monitoredGroupName: null,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO accounts (id, display_name, phone_number, monitored_group_id, monitored_group_name)
     VALUES (@id, @displayName, @phoneNumber, @monitoredGroupId, @monitoredGroupName)`,
  ).run({
    id: account.id,
    displayName: account.displayName,
    phoneNumber: account.phoneNumber,
    monitoredGroupId: account.monitoredGroupId,
    monitoredGroupName: account.monitoredGroupName,
  });
  return account;
}

/**
 * Builds a minimal NewMessage, with sensible defaults for fields not specified.
 */
let _msgCounter = 0;

export function buildMessage(overrides: Partial<NewMessage> = {}): NewMessage {
  return {
    accountId: 1,
    groupId: 'test-group@g.us',
    messageId: `msg-${++_msgCounter}`,
    timestamp: new Date('2026-01-01T10:00:00Z'),
    sender: 'Test Sender',
    content: 'Test message content',
    ...overrides,
  };
}
