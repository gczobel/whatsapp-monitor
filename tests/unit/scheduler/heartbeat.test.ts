import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runHeartbeat } from '../../../src/scheduler/heartbeat.js';
import { createTestDatabase, seedAccount, buildMessage } from '../../fixtures/index.js';
import { insertMessage } from '../../../src/db/messages.js';
import { insertScanResult } from '../../../src/db/results.js';
import type { Database } from 'better-sqlite3';
import type { ScanProfile } from '../../../src/types.js';

function makeHeartbeatProfile(overrides: Partial<ScanProfile> = {}): ScanProfile {
  return {
    id: 'heartbeat',
    name: 'Daily Heartbeat',
    prompt: 'Summarise',
    cron: '0 8 * * *',
    isEnabled: true,
    ...overrides,
  };
}

const GROUP_ID = 'group@g.us';

let db: Database;
beforeEach(() => {
  db = createTestDatabase();
  seedAccount(db);
});

describe('runHeartbeat', () => {
  it('calls onResult with a status message', async () => {
    const onResult = vi.fn();
    await runHeartbeat({
      db,
      llm: { complete: vi.fn() },
      profile: makeHeartbeatProfile(),
      accountId: 1,
      groupId: GROUP_ID,
      scanWindowDays: 14,
      skipEmptyDelivery: false,
      onResult,
    });
    expect(onResult).toHaveBeenCalledOnce();
    const [output, profileId] = onResult.mock.calls[0] as [string, string];
    expect(profileId).toBe('heartbeat');
    expect(output).toContain('Bot is alive');
  });

  it('reports zero messages and zero scans when DB is empty', async () => {
    const onResult = vi.fn();
    await runHeartbeat({
      db,
      llm: { complete: vi.fn() },
      profile: makeHeartbeatProfile(),
      accountId: 1,
      groupId: GROUP_ID,
      scanWindowDays: 14,
      skipEmptyDelivery: false,
      onResult,
    });
    const [output] = onResult.mock.calls[0] as [string];
    expect(output).toContain('Messages captured: 0');
    expect(output).toContain('"Daily Heartbeat" scans: 0');
  });

  it('counts messages captured in the window', async () => {
    const recent = new Date(Date.now() - 60_000); // 1 min ago — within 24h
    insertMessage(db, buildMessage({ groupId: GROUP_ID, timestamp: recent }));
    insertMessage(db, buildMessage({ groupId: GROUP_ID, timestamp: recent }));

    const onResult = vi.fn();
    await runHeartbeat({
      db,
      llm: { complete: vi.fn() },
      profile: makeHeartbeatProfile(),
      accountId: 1,
      groupId: GROUP_ID,
      scanWindowDays: 14,
      skipEmptyDelivery: false,
      onResult,
    });
    const [output] = onResult.mock.calls[0] as [string];
    expect(output).toContain('Messages captured: 2');
  });

  it('excludes messages older than the window', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago — outside 24h window
    insertMessage(db, buildMessage({ groupId: GROUP_ID, timestamp: old }));

    const onResult = vi.fn();
    await runHeartbeat({
      db,
      llm: { complete: vi.fn() },
      profile: makeHeartbeatProfile(),
      accountId: 1,
      groupId: GROUP_ID,
      scanWindowDays: 14,
      skipEmptyDelivery: false,
      onResult,
    });
    const [output] = onResult.mock.calls[0] as [string];
    expect(output).toContain('Messages captured: 0');
  });

  it('counts scans for this profile', async () => {
    const recent = new Date(Date.now() - 60_000);
    // Insert 2 scan results for this profile and 1 for another — only this profile's count appears
    insertScanResult(db, {
      accountId: 1,
      profileId: 'heartbeat',
      timestamp: recent,
      inputMessageIds: [],
      previousSummary: null,
      output: 'result 1',
    });
    insertScanResult(db, {
      accountId: 1,
      profileId: 'heartbeat',
      timestamp: recent,
      inputMessageIds: [],
      previousSummary: null,
      output: 'result 2',
    });
    insertScanResult(db, {
      accountId: 1,
      profileId: 'other-profile',
      timestamp: recent,
      inputMessageIds: [],
      previousSummary: null,
      output: 'other',
    });

    const onResult = vi.fn();
    await runHeartbeat({
      db,
      llm: { complete: vi.fn() },
      profile: makeHeartbeatProfile(),
      accountId: 1,
      groupId: GROUP_ID,
      scanWindowDays: 14,
      skipEmptyDelivery: false,
      onResult,
    });
    const [output] = onResult.mock.calls[0] as [string];
    expect(output).toContain('"Daily Heartbeat" scans: 2');
  });

  it('respects overrideSince for manual runs', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    insertMessage(db, buildMessage({ groupId: GROUP_ID, timestamp: twoHoursAgo }));
    insertMessage(db, buildMessage({ groupId: GROUP_ID, timestamp: fourHoursAgo }));

    const onResult = vi.fn();
    // Override: look back only 3h — should see 1 message, not 2
    await runHeartbeat({
      db,
      llm: { complete: vi.fn() },
      profile: makeHeartbeatProfile(),
      accountId: 1,
      groupId: GROUP_ID,
      scanWindowDays: 14,
      skipEmptyDelivery: false,
      onResult,
      overrideSince: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    const [output] = onResult.mock.calls[0] as [string];
    expect(output).toContain('Messages captured: 1');
    expect(output).toContain('selected window');
  });

  it('does not call the LLM', async () => {
    const llm = { complete: vi.fn() };
    await runHeartbeat({
      db,
      llm,
      profile: makeHeartbeatProfile(),
      accountId: 1,
      groupId: GROUP_ID,
      scanWindowDays: 14,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
