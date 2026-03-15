import type { Database } from 'better-sqlite3';
import type { Account } from '../types.js';

interface AccountRow {
  id: number;
  display_name: string;
  phone_number: string;
  monitored_group_id: string | null;
  monitored_group_name: string | null;
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    displayName: row.display_name,
    phoneNumber: row.phone_number,
    monitoredGroupId: row.monitored_group_id,
    monitoredGroupName: row.monitored_group_name,
  };
}

export function getAccount(db: Database, id: number): Account | null {
  const row = db
    .prepare<[number], AccountRow>(
      `SELECT id, display_name, phone_number, monitored_group_id, monitored_group_name
       FROM accounts WHERE id = ?`,
    )
    .get(id);
  return row !== undefined ? rowToAccount(row) : null;
}

export function upsertAccount(
  db: Database,
  account: Pick<Account, 'id' | 'displayName' | 'phoneNumber'>,
): void {
  db.prepare(
    `INSERT INTO accounts (id, display_name, phone_number)
     VALUES (@id, @displayName, @phoneNumber)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       phone_number = excluded.phone_number`,
  ).run(account);
}

export function setMonitoredGroup(
  db: Database,
  accountId: number,
  groupId: string,
  groupName: string,
): void {
  db.prepare(
    `UPDATE accounts
     SET monitored_group_id = @groupId, monitored_group_name = @groupName
     WHERE id = @accountId`,
  ).run({ accountId, groupId, groupName });
}

export function clearMonitoredGroup(db: Database, accountId: number): void {
  db.prepare(
    `UPDATE accounts
     SET monitored_group_id = NULL, monitored_group_name = NULL
     WHERE id = ?`,
  ).run(accountId);
}
