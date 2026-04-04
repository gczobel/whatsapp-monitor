import { getMessageCount } from '../db/messages.js';
import { getScanStatsSince } from '../db/results.js';
import { logPrefix, formatTimestamp } from '../utils.js';
import type { RunProfileOptions } from './runner.js';

/**
 * Sends a "bot alive" status ping for a specific profile.
 *
 * Reports (for the last 24h, or overrideSince window):
 *  - Messages captured in the monitored group
 *  - How many times this profile ran
 *  - Last scan time for this profile
 *
 * Reuses RunProfileOptions so the scheduler can call this the same way as runProfile.
 */
export function runHeartbeat(options: RunProfileOptions): Promise<void> {
  const { db, profile, accountId, groupId, onResult, overrideSince } = options;

  const since = overrideSince ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const windowLabel = overrideSince ? 'selected window' : 'last 24h';

  const messageCount = getMessageCount(db, accountId, groupId, since);
  const allStats = getScanStatsSince(db, accountId, since);
  const profileStat = allStats.find((s) => s.profileId === profile.id);

  const scanCount = profileStat?.count ?? 0;
  const lastScan = profileStat?.lastRun ?? null;

  const lines: string[] = [
    'Bot is alive and monitoring.',
    '',
    `📊 ${windowLabel}:`,
    `• Messages captured: ${messageCount}`,
    `• "${profile.name}" scans: ${scanCount}`,
  ];

  if (lastScan !== null) {
    lines.push(`• Last scan: ${formatTimestamp(lastScan)}`);
  }

  const output = lines.join('\n');

  console.info(
    logPrefix('scheduler', 'INFO'),
    `Heartbeat "${profile.name}" — ${messageCount} messages, ${scanCount} scans`,
  );

  onResult(output, profile.id);
  return Promise.resolve();
}
