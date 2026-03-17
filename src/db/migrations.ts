import type { Database } from 'better-sqlite3';

/**
 * The single migration that sets up the initial schema.
 * Inlined as a string so the compiled output is self-contained — no SQL files to copy.
 *
 * All tables include account_id for multi-account readiness (FR1).
 */
const migration001 = `
  CREATE TABLE IF NOT EXISTS accounts (
    id                   INTEGER PRIMARY KEY,
    display_name         TEXT    NOT NULL,
    phone_number         TEXT    NOT NULL DEFAULT '',
    monitored_group_id   TEXT,
    monitored_group_name TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    account_id   INTEGER  NOT NULL REFERENCES accounts(id),
    group_id     TEXT     NOT NULL,
    message_id   TEXT     NOT NULL,
    timestamp    DATETIME NOT NULL,
    sender       TEXT     NOT NULL,
    content      TEXT     NOT NULL,
    processed_by TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique
    ON messages (account_id, group_id, message_id);

  CREATE INDEX IF NOT EXISTS idx_messages_account_group
    ON messages (account_id, group_id, timestamp);

  CREATE TABLE IF NOT EXISTS scan_results (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    account_id          INTEGER  NOT NULL REFERENCES accounts(id),
    profile_id          TEXT     NOT NULL,
    timestamp           DATETIME NOT NULL,
    input_message_ids   TEXT     NOT NULL,
    previous_summary    TEXT,
    output              TEXT     NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scan_results_account_profile
    ON scan_results (account_id, profile_id, timestamp);
`;

export function runMigrations(db: Database): void {
  db.exec(migration001);
}
