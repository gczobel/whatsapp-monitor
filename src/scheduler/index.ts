import cron from 'node-cron';
import type { Database } from 'better-sqlite3';
import type { LLMClient } from '../llm/interface.js';
import type { ScanProfile } from '../types.js';
import { runProfile } from './runner.js';
import { runHeartbeat } from './heartbeat.js';
import { getLastScanResult } from '../db/results.js';
import { getPrevCronRun, logPrefix } from '../utils.js';

export interface SchedulerOptions {
  db: Database;
  llm: LLMClient;
  accountId: number;
  groupId: string;
  scanWindowDays: number;
  skipEmptyDelivery: boolean;
  onResult: (output: string, profileId: string) => void;
}

/**
 * Registers cron jobs for all enabled profiles and returns a function to stop them.
 * Each profile registers a scan job. If the profile also has heartbeatCron set,
 * a separate heartbeat job is registered on that schedule.
 */
export function startScheduler(profiles: ScanProfile[], options: SchedulerOptions): () => void {
  const enabledProfiles = profiles.filter((p) => p.isEnabled);

  // Catchup: if a scan cron should have fired while the app was off, run it now.
  // Heartbeats are skipped — a late status ping has no value.
  for (const profile of enabledProfiles) {
    const lastResult = getLastScanResult(options.db, options.accountId, profile.id);
    const prevCron = getPrevCronRun(profile.cron);
    if (prevCron && (!lastResult || lastResult.timestamp < prevCron)) {
      console.info(
        logPrefix('scheduler', 'INFO'),
        `Catchup: profile "${profile.name}" missed a run — executing now`,
      );
      runProfile({ ...options, profile }).catch((error: unknown) => {
        console.error(
          logPrefix('scheduler', 'ERROR'),
          `Catchup error for profile "${profile.name}":`,
          error,
        );
      });
    }
  }

  const tasks = enabledProfiles.flatMap((profile) => {
    console.info(
      logPrefix('scheduler', 'INFO'),
      `Scheduling profile "${profile.name}" — scan: ${profile.cron}${profile.heartbeatCron ? `, heartbeat: ${profile.heartbeatCron}` : ''}`,
    );

    const scanTask = cron.schedule(profile.cron, () => {
      runProfile({ ...options, profile }).catch((error: unknown) => {
        console.error(
          logPrefix('scheduler', 'ERROR'),
          `Unhandled error in profile "${profile.name}":`,
          error,
        );
      });
    });

    if (!profile.heartbeatCron) return [scanTask];

    const heartbeatTask = cron.schedule(profile.heartbeatCron, () => {
      runHeartbeat({ ...options, profile }).catch((error: unknown) => {
        console.error(
          logPrefix('scheduler', 'ERROR'),
          `Heartbeat error for profile "${profile.name}":`,
          error,
        );
      });
    });

    return [scanTask, heartbeatTask];
  });

  return () => {
    tasks.forEach((task) => {
      void task.stop();
    });
  };
}
