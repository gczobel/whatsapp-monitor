import cron from 'node-cron';
import type { Database } from 'better-sqlite3';
import type { LLMClient } from '../llm/interface.js';
import type { ScanProfile } from '../types.js';
import { runProfile } from './runner.js';
import { logPrefix } from '../utils.js';

export interface SchedulerOptions {
  db: Database;
  llm: LLMClient;
  accountId: number;
  groupId: string;
  onResult: (output: string, profileId: string) => void;
}

/**
 * Registers cron jobs for all enabled profiles and returns a function to stop them.
 */
export function startScheduler(profiles: ScanProfile[], options: SchedulerOptions): () => void {
  const tasks = profiles
    .filter((p) => p.isEnabled)
    .map((profile) => {
      console.info(
        logPrefix('scheduler', 'INFO'),
        `Scheduling profile "${profile.name}" — cron: ${profile.cron}`,
      );

      return cron.schedule(profile.cron, () => {
        runProfile({ ...options, profile }).catch((error: unknown) => {
          console.error(
            logPrefix('scheduler', 'ERROR'),
            `Unhandled error in profile "${profile.name}":`,
            error,
          );
        });
      });
    });

  return () => {
    tasks.forEach((task) => task.stop());
  };
}
