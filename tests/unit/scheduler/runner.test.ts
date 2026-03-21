import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLLMInput, runProfile } from '../../../src/scheduler/runner.js';
import { createTestDatabase, seedAccount, buildMessage } from '../../fixtures/index.js';
import { insertMessage } from '../../../src/db/messages.js';
import type { Database } from 'better-sqlite3';
import type { ScanProfile } from '../../../src/types.js';

function makeProfile(overrides: Partial<ScanProfile> = {}): ScanProfile {
  return {
    id: 'daily',
    name: 'Daily Summary',
    prompt: 'Summarise the group activity.',
    cron: '0 9 * * *',
    isEnabled: true,
    ...overrides,
  };
}

let db: Database;
beforeEach(() => {
  db = createTestDatabase();
  seedAccount(db);
});

describe('runProfile', () => {
  it('should call llm.complete and invoke onResult with the output', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('LLM summary') };
    const onResult = vi.fn();

    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult,
    });

    expect(llm.complete).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledWith('LLM summary', 'daily');
  });

  it('should include the profile prompt in the LLM input', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('output') };
    await runProfile({
      db,
      llm,
      profile: makeProfile({ prompt: 'Custom prompt' }),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });
    const [prompt] = llm.complete.mock.calls[0] as [string];
    expect(prompt).toContain('Custom prompt');
  });

  it('should include new messages in the LLM input', async () => {
    insertMessage(db, buildMessage({ content: 'Elevator broken', groupId: 'group@g.us' }));
    const llm = { complete: vi.fn().mockResolvedValue('output') };
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });
    const [prompt] = llm.complete.mock.calls[0] as [string];
    expect(prompt).toContain('Elevator broken');
  });

  it('should persist the scan result to the database', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('Stored summary') };
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });
    const row = db.prepare('SELECT * FROM scan_results WHERE profile_id = ?').get('daily') as
      | { output: string }
      | undefined;
    expect(row?.output).toBe('Stored summary');
  });

  it('should mark messages as processed after a successful run', async () => {
    insertMessage(db, buildMessage({ groupId: 'group@g.us' }));
    const llm = { complete: vi.fn().mockResolvedValue('output') };
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });
    const row = db.prepare('SELECT processed_by FROM messages LIMIT 1').get() as {
      processed_by: string | null;
    };
    expect(row.processed_by).toBe('daily');
  });

  it('should throw a wrapped error when llm.complete rejects', async () => {
    insertMessage(db, buildMessage({ groupId: 'group@g.us' }));
    const llm = { complete: vi.fn().mockRejectedValue(new Error('timeout')) };
    await expect(
      runProfile({
        db,
        llm,
        profile: makeProfile(),
        accountId: 1,
        groupId: 'group@g.us',
        scanWindowDays: 365,
        skipEmptyDelivery: false,
        onResult: vi.fn(),
      }),
    ).rejects.toThrow('Profile run failed');
  });

  it('should use overrideSince as the message cutoff instead of last run timestamp', async () => {
    // Insert a message 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    insertMessage(db, buildMessage({ groupId: 'group@g.us', timestamp: twoHoursAgo }));

    const llm = { complete: vi.fn().mockResolvedValue('output') };

    // Run with overrideSince = 1 hour ago → message is outside window → no messages
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
      overrideSince: oneHourAgo,
    });
    const [promptNoMsg] = llm.complete.mock.calls[0] as [string];
    expect(promptNoMsg).toContain('no new messages');

    // Run with overrideSince = 3 hours ago → message is inside window → 1 message
    llm.complete.mockResolvedValue('output2');
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
      overrideSince: threeHoursAgo,
    });
    const [promptWithMsg] = llm.complete.mock.calls[1] as [string];
    expect(promptWithMsg).toContain('New messages');
  });

  it('should still load previous summary when overrideSince is set', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('First summary') };
    // First run to store a summary
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });

    // Second run with overrideSince — should still include the previous summary
    llm.complete.mockResolvedValue('Second summary');
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
      overrideSince: new Date(0),
    });
    const [secondPrompt] = llm.complete.mock.calls[1] as [string];
    expect(secondPrompt).toContain('First summary');
  });

  it('should use the previous scan result as context for the next run', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('First summary') };
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });

    llm.complete.mockResolvedValue('Second summary');
    insertMessage(db, buildMessage({ groupId: 'group@g.us', timestamp: new Date() }));
    await runProfile({
      db,
      llm,
      profile: makeProfile(),
      accountId: 1,
      groupId: 'group@g.us',
      scanWindowDays: 365,
      skipEmptyDelivery: false,
      onResult: vi.fn(),
    });

    const [secondPrompt] = llm.complete.mock.calls[1] as [string];
    expect(secondPrompt).toContain('First summary');
  });
});

describe('buildLLMInput', () => {
  it('should include previous summary when one exists', () => {
    const result = buildLLMInput({
      previousSummary: 'Building quiet yesterday.',
      newMessages: [{ sender: 'Yossi', content: 'Noise at 8am', timestamp: new Date() }],
    });
    expect(result).toContain('Building quiet yesterday.');
    expect(result).toContain('Noise at 8am');
  });

  it('should handle empty previous summary', () => {
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'Yossi', content: 'Noise at 8am', timestamp: new Date() }],
    });
    expect(result).not.toContain('null');
    expect(result).toContain('Noise at 8am');
  });

  it('should return prompt-only string when no new messages', () => {
    const result = buildLLMInput({
      previousSummary: 'All quiet.',
      newMessages: [],
    });
    expect(result).toContain('All quiet.');
    expect(result).toContain('no new messages');
  });

  it('should include all messages in order', () => {
    const t1 = new Date('2026-01-01T08:00:00Z');
    const t2 = new Date('2026-01-01T09:00:00Z');
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [
        { sender: 'Alice', content: 'First message', timestamp: t1 },
        { sender: 'Bob', content: 'Second message', timestamp: t2 },
      ],
    });
    expect(result).toContain('Alice');
    expect(result).toContain('First message');
    expect(result).toContain('Bob');
    expect(result).toContain('Second message');
    expect(result.indexOf('First message')).toBeLessThan(result.indexOf('Second message'));
  });

  it('should include sender and timestamp for each message', () => {
    const timestamp = new Date('2026-03-15T10:30:00Z');
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'Yossi', content: 'Water leak on floor 3', timestamp }],
    });
    expect(result).toContain('Yossi');
    expect(result).toContain('2026-03-15T10:30:00.000Z');
    expect(result).toContain('Water leak on floor 3');
  });

  it('should not include "Previous summary" section when previousSummary is null', () => {
    const result = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'A', content: 'Hello', timestamp: new Date() }],
    });
    expect(result).not.toContain('Previous summary');
  });

  it('should always include the non-text media disclaimer', () => {
    const withMessages = buildLLMInput({
      previousSummary: null,
      newMessages: [{ sender: 'A', content: 'Hello', timestamp: new Date() }],
    });
    expect(withMessages).toContain('Images, audio, and documents are not analyzed');

    const withoutMessages = buildLLMInput({ previousSummary: null, newMessages: [] });
    expect(withoutMessages).toContain('Images, audio, and documents are not analyzed');
  });
});
