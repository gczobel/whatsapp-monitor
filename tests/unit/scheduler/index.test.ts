import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScanProfile } from '../../../src/types.js';

// Mock node-cron before importing the module under test
vi.mock('node-cron', () => {
  const mockTask = { stop: vi.fn() };
  return {
    default: {
      schedule: vi.fn().mockReturnValue(mockTask),
    },
  };
});

// Mock runner so tests don't trigger real DB/LLM calls
vi.mock('../../../src/scheduler/runner.js', () => ({
  runProfile: vi.fn().mockResolvedValue(undefined),
}));

// Mock getLastScanResult to control catchup behaviour
vi.mock('../../../src/db/results.js', () => ({
  getLastScanResult: vi.fn().mockReturnValue(null),
}));

import cron from 'node-cron';
import { startScheduler, type SchedulerOptions } from '../../../src/scheduler/index.js';
import { runProfile } from '../../../src/scheduler/runner.js';
import { getLastScanResult } from '../../../src/db/results.js';
import { createTestDatabase, seedAccount } from '../../fixtures/index.js';

const mockRunProfile = vi.mocked(runProfile);
const mockGetLastScanResult = vi.mocked(getLastScanResult);

const mockCronSchedule = vi.mocked(cron.schedule);

function makeOptions(): SchedulerOptions {
  const db = createTestDatabase();
  seedAccount(db);
  return {
    db,
    llm: { complete: vi.fn().mockResolvedValue('summary') },
    accountId: 1,
    groupId: 'group@g.us',
    scanWindowDays: 14,
    skipEmptyDelivery: true,
    onResult: vi.fn(),
  };
}

function makeProfile(overrides: Partial<ScanProfile> = {}): ScanProfile {
  return {
    id: 'daily',
    name: 'Daily Summary',
    prompt: 'Summarise',
    cron: '0 9 * * *',
    isEnabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startScheduler', () => {
  it('should schedule a cron job for each enabled profile', () => {
    const profiles = [makeProfile({ id: 'p1' }), makeProfile({ id: 'p2' })];
    startScheduler(profiles, makeOptions());
    expect(mockCronSchedule).toHaveBeenCalledTimes(2);
  });

  it('should skip disabled profiles', () => {
    const profiles = [
      makeProfile({ id: 'enabled', isEnabled: true }),
      makeProfile({ id: 'disabled', isEnabled: false }),
    ];
    startScheduler(profiles, makeOptions());
    expect(mockCronSchedule).toHaveBeenCalledTimes(1);
  });

  it('should use the profile cron expression when scheduling', () => {
    const profile = makeProfile({ cron: '0 8 * * 1' });
    startScheduler([profile], makeOptions());
    expect(mockCronSchedule).toHaveBeenCalledWith('0 8 * * 1', expect.any(Function));
  });

  it('should return a stop function that calls task.stop()', () => {
    const stop = startScheduler([makeProfile()], makeOptions());
    stop();
    const mockTask = mockCronSchedule.mock.results[0]?.value as { stop: ReturnType<typeof vi.fn> };
    expect(mockTask.stop).toHaveBeenCalledOnce();
  });

  it('should not schedule anything when all profiles are disabled', () => {
    const profiles = [makeProfile({ isEnabled: false }), makeProfile({ isEnabled: false })];
    startScheduler(profiles, makeOptions());
    expect(mockCronSchedule).not.toHaveBeenCalled();
  });

  it('should not schedule anything when profiles list is empty', () => {
    startScheduler([], makeOptions());
    expect(mockCronSchedule).not.toHaveBeenCalled();
  });

  it('should run catchup for a profile that missed its last cron tick', () => {
    // No previous scan result → the profile has never run → catchup should fire
    mockGetLastScanResult.mockReturnValue(null);
    startScheduler([makeProfile()], makeOptions());
    expect(mockRunProfile).toHaveBeenCalledOnce();
  });

  it('should not run catchup when the last run is after the previous cron tick', () => {
    // Last run is just now → no missed tick
    mockGetLastScanResult.mockReturnValue({
      id: 1,
      accountId: 1,
      profileId: 'daily',
      timestamp: new Date(),
      inputMessageIds: [],
      previousSummary: null,
      output: 'recent result',
    });
    startScheduler([makeProfile()], makeOptions());
    expect(mockRunProfile).not.toHaveBeenCalled();
  });
});
