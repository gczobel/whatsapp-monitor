import type { Database } from 'better-sqlite3';
import type { Message, NewMessage } from '../types.js';

interface MessageRow {
  id: number;
  account_id: number;
  group_id: string;
  timestamp: string;
  sender: string;
  content: string;
  processed_by: string | null;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    accountId: row.account_id,
    groupId: row.group_id,
    timestamp: new Date(row.timestamp),
    sender: row.sender,
    content: row.content,
    processedBy: row.processed_by,
  };
}

export function insertMessage(db: Database, message: NewMessage): number {
  const result = db
    .prepare(
      `INSERT INTO messages (account_id, group_id, timestamp, sender, content)
       VALUES (@accountId, @groupId, @timestamp, @sender, @content)`,
    )
    .run({
      accountId: message.accountId,
      groupId: message.groupId,
      timestamp: message.timestamp.toISOString(),
      sender: message.sender,
      content: message.content,
    });
  return result.lastInsertRowid as number;
}

export function getMessagesSince(
  db: Database,
  accountId: number,
  groupId: string,
  since: Date,
): Message[] {
  const rows = db
    .prepare<[number, string, string], MessageRow>(
      `SELECT id, account_id, group_id, timestamp, sender, content, processed_by
       FROM messages
       WHERE account_id = ? AND group_id = ? AND timestamp > ?
       ORDER BY timestamp ASC`,
    )
    .all(accountId, groupId, since.toISOString());
  return rows.map(rowToMessage);
}

export function markMessagesProcessed(db: Database, messageIds: number[], profileId: string): void {
  if (messageIds.length === 0) return;

  const placeholders = messageIds.map(() => '?').join(', ');
  db.prepare(`UPDATE messages SET processed_by = ? WHERE id IN (${placeholders})`).run(
    profileId,
    ...messageIds,
  );
}
