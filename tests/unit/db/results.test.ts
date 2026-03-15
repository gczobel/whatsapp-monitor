import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  insertScanResult,
  getLastScanResult,
  getScanResultsForProfile,
} from '../../../src/db/results.js';
import { createTestDatabase, seedAccount } from '../../fixtures/index.js';
import type { NewScanResult } from '../../../src/types.js';

let db: Database;

function buildResult(overrides: Partial<NewScanResult> = {}): NewScanResult {
  return {
    accountId: 1,
    profileId: 'daily',
    timestamp: new Date('2026-01-01T10:00:00Z'),
    inputMessageIds: [1, 2, 3],
    previousSummary: null,
    output: 'Summary text',
    ...overrides,
  };
}

beforeEach(() => {
  db = createTestDatabase();
  seedAccount(db);
});

describe('insertScanResult', () => {
  it('should return a positive integer id', () => {
    const id = insertScanResult(db, buildResult());
    expect(id).toBeGreaterThan(0);
  });

  it('should persist all fields correctly', () => {
    const timestamp = new Date('2026-03-16T09:00:00Z');
    insertScanResult(
      db,
      buildResult({
        profileId: 'urgent',
        timestamp,
        inputMessageIds: [10, 20],
        previousSummary: 'Previous text',
        output: 'New summary',
      }),
    );

    const result = getLastScanResult(db, 1, 'urgent');
    expect(result).not.toBeNull();
    expect(result?.profileId).toBe('urgent');
    expect(result?.timestamp).toEqual(timestamp);
    expect(result?.inputMessageIds).toEqual([10, 20]);
    expect(result?.previousSummary).toBe('Previous text');
    expect(result?.output).toBe('New summary');
  });

  it('should persist null previousSummary', () => {
    insertScanResult(db, buildResult({ previousSummary: null }));
    const result = getLastScanResult(db, 1, 'daily');
    expect(result?.previousSummary).toBeNull();
  });
});

describe('getLastScanResult', () => {
  it('should return null when no results exist', () => {
    expect(getLastScanResult(db, 1, 'daily')).toBeNull();
  });

  it('should return the most recent result when multiple exist', () => {
    insertScanResult(
      db,
      buildResult({ timestamp: new Date('2026-01-01T08:00:00Z'), output: 'Old' }),
    );
    insertScanResult(
      db,
      buildResult({ timestamp: new Date('2026-01-01T10:00:00Z'), output: 'New' }),
    );

    const result = getLastScanResult(db, 1, 'daily');
    expect(result?.output).toBe('New');
  });

  it('should return null for a profile with no results even if others exist', () => {
    insertScanResult(db, buildResult({ profileId: 'other' }));
    expect(getLastScanResult(db, 1, 'daily')).toBeNull();
  });
});

describe('getScanResultsForProfile', () => {
  it('should return empty array when no results exist', () => {
    expect(getScanResultsForProfile(db, 1, 'daily', 10)).toHaveLength(0);
  });

  it('should return results ordered by timestamp descending', () => {
    insertScanResult(
      db,
      buildResult({ timestamp: new Date('2026-01-01T08:00:00Z'), output: 'First' }),
    );
    insertScanResult(
      db,
      buildResult({ timestamp: new Date('2026-01-01T10:00:00Z'), output: 'Second' }),
    );

    const results = getScanResultsForProfile(db, 1, 'daily', 10);
    expect(results[0]?.output).toBe('Second');
    expect(results[1]?.output).toBe('First');
  });

  it('should respect the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      insertScanResult(
        db,
        buildResult({ timestamp: new Date(`2026-01-0${String(i + 1)}T10:00:00Z`) }),
      );
    }
    expect(getScanResultsForProfile(db, 1, 'daily', 3)).toHaveLength(3);
  });

  it('should only return results for the specified profile', () => {
    insertScanResult(db, buildResult({ profileId: 'daily' }));
    insertScanResult(db, buildResult({ profileId: 'weekly' }));

    const results = getScanResultsForProfile(db, 1, 'daily', 10);
    expect(results).toHaveLength(1);
    expect(results[0]?.profileId).toBe('daily');
  });
});
