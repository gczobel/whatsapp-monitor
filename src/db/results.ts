import type { Database } from 'better-sqlite3';
import type { ScanResult, NewScanResult } from '../types.js';

interface ScanResultRow {
  id: number;
  account_id: number;
  profile_id: string;
  timestamp: string;
  input_message_ids: string;
  previous_summary: string | null;
  output: string;
}

function rowToScanResult(row: ScanResultRow): ScanResult {
  return {
    id: row.id,
    accountId: row.account_id,
    profileId: row.profile_id,
    timestamp: new Date(row.timestamp),
    inputMessageIds: JSON.parse(row.input_message_ids) as number[],
    previousSummary: row.previous_summary,
    output: row.output,
  };
}

export function insertScanResult(db: Database, result: NewScanResult): number {
  const row = db
    .prepare(
      `INSERT INTO scan_results
         (account_id, profile_id, timestamp, input_message_ids, previous_summary, output)
       VALUES
         (@accountId, @profileId, @timestamp, @inputMessageIds, @previousSummary, @output)`,
    )
    .run({
      accountId: result.accountId,
      profileId: result.profileId,
      timestamp: result.timestamp.toISOString(),
      inputMessageIds: JSON.stringify(result.inputMessageIds),
      previousSummary: result.previousSummary,
      output: result.output,
    });
  return row.lastInsertRowid as number;
}

export function getLastScanResult(
  db: Database,
  accountId: number,
  profileId: string,
): ScanResult | null {
  const row = db
    .prepare<[number, string], ScanResultRow>(
      `SELECT id, account_id, profile_id, timestamp, input_message_ids, previous_summary, output
       FROM scan_results
       WHERE account_id = ? AND profile_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
    )
    .get(accountId, profileId);
  return row !== undefined ? rowToScanResult(row) : null;
}

export function getScanResultsForProfile(
  db: Database,
  accountId: number,
  profileId: string,
  limit: number,
): ScanResult[] {
  const rows = db
    .prepare<[number, string, number], ScanResultRow>(
      `SELECT id, account_id, profile_id, timestamp, input_message_ids, previous_summary, output
       FROM scan_results
       WHERE account_id = ? AND profile_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(accountId, profileId, limit);
  return rows.map(rowToScanResult);
}
