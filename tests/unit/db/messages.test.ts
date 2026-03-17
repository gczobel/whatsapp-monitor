import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  insertMessage,
  getMessagesSince,
  getMessagesByIds,
  markMessagesProcessed,
} from '../../../src/db/messages.js';
import { createTestDatabase, seedAccount, buildMessage } from '../../fixtures/index.js';

let db: Database;

beforeEach(() => {
  db = createTestDatabase();
  seedAccount(db);
});

describe('insertMessage', () => {
  it('should insert a message into the database', () => {
    insertMessage(db, buildMessage());
    const count = (db.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it('should persist all message fields', () => {
    const timestamp = new Date('2026-01-01T10:00:00Z');
    insertMessage(
      db,
      buildMessage({
        sender: 'Yossi',
        content: 'Water leak on floor 3',
        timestamp,
      }),
    );

    const row = db.prepare('SELECT * FROM messages WHERE id = 1').get() as Record<string, unknown>;
    expect(row['sender']).toBe('Yossi');
    expect(row['content']).toBe('Water leak on floor 3');
    expect(row['processed_by']).toBeNull();
  });

  it('should silently ignore a duplicate message_id (INSERT OR IGNORE)', () => {
    const msg = buildMessage({ messageId: 'dup-id' });
    insertMessage(db, msg);
    insertMessage(db, msg); // same messageId — should not throw or insert twice
    const count = (db.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }).n;
    expect(count).toBe(1);
  });
});

describe('getMessagesSince', () => {
  it('should return messages after the given timestamp', () => {
    const t0 = new Date('2026-01-01T09:00:00Z');
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-01T11:00:00Z');

    insertMessage(db, buildMessage({ timestamp: t1, content: 'First' }));
    insertMessage(db, buildMessage({ timestamp: t2, content: 'Second' }));

    const messages = getMessagesSince(db, 1, 'test-group@g.us', t0);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('First');
    expect(messages[1]?.content).toBe('Second');
  });

  it('should exclude messages at or before the cutoff timestamp', () => {
    const cutoff = new Date('2026-01-01T10:00:00Z');

    insertMessage(db, buildMessage({ timestamp: cutoff, content: 'At cutoff — excluded' }));
    insertMessage(
      db,
      buildMessage({
        timestamp: new Date('2026-01-01T10:00:01Z'),
        content: 'After cutoff — included',
      }),
    );

    const messages = getMessagesSince(db, 1, 'test-group@g.us', cutoff);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('After cutoff — included');
  });

  it('should return empty array when no messages exist since the cutoff', () => {
    const messages = getMessagesSince(db, 1, 'test-group@g.us', new Date());
    expect(messages).toHaveLength(0);
  });

  it('should only return messages for the given group', () => {
    insertMessage(db, buildMessage({ groupId: 'group-a@g.us', content: 'Group A' }));
    insertMessage(db, buildMessage({ groupId: 'group-b@g.us', content: 'Group B' }));

    const messages = getMessagesSince(db, 1, 'group-a@g.us', new Date(0));
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Group A');
  });
});

describe('getMessagesByIds', () => {
  it('should return messages matching the given ids', () => {
    insertMessage(db, buildMessage({ content: 'Alpha' }));
    insertMessage(db, buildMessage({ content: 'Beta' }));
    const [row1, row2] = db.prepare('SELECT id FROM messages ORDER BY id').all() as Array<{
      id: number;
    }>;

    const results = getMessagesByIds(db, [row1!.id, row2!.id]);
    expect(results).toHaveLength(2);
    expect(results[0]?.content).toBe('Alpha');
    expect(results[1]?.content).toBe('Beta');
  });

  it('should return only the requested messages, not others', () => {
    insertMessage(db, buildMessage({ content: 'Alpha' }));
    insertMessage(db, buildMessage({ content: 'Beta' }));
    const [row1] = db.prepare('SELECT id FROM messages ORDER BY id').all() as Array<{ id: number }>;

    const results = getMessagesByIds(db, [row1!.id]);
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe('Alpha');
  });

  it('should return an empty array when given an empty id list', () => {
    expect(getMessagesByIds(db, [])).toEqual([]);
  });
});

describe('markMessagesProcessed', () => {
  it('should set processed_by for the given message ids', () => {
    insertMessage(db, buildMessage({ content: 'Msg 1' }));
    insertMessage(db, buildMessage({ content: 'Msg 2' }));
    const ids = (
      db.prepare('SELECT id FROM messages ORDER BY id').all() as Array<{ id: number }>
    ).map((r) => r.id);

    markMessagesProcessed(db, ids, 'urgent-scan');

    const rows = db.prepare('SELECT processed_by FROM messages').all() as Array<{
      processed_by: string | null;
    }>;
    expect(rows[0]?.processed_by).toBe('urgent-scan');
    expect(rows[1]?.processed_by).toBe('urgent-scan');
  });

  it('should not throw when called with an empty id list', () => {
    expect(() => markMessagesProcessed(db, [], 'urgent-scan')).not.toThrow();
  });
});
