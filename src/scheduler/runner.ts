import type { Database } from 'better-sqlite3';
import type { LLMClient } from '../llm/interface.js';
import type { ScanProfile, Message } from '../types.js';
import { getMessagesSince, markMessagesProcessed } from '../db/messages.js';
import { getLastScanResult, insertScanResult } from '../db/results.js';
import { logPrefix } from '../utils.js';

export interface LLMInputParams {
  previousSummary: string | null;
  newMessages: Pick<Message, 'sender' | 'content' | 'timestamp'>[];
}

/**
 * Builds the prompt string passed to the LLM for a profile run.
 * Combines the rolling previous summary with the new messages.
 */
export function buildLLMInput(params: LLMInputParams): string {
  const parts: string[] = [];

  if (params.previousSummary !== null) {
    parts.push(`Previous summary:\n${params.previousSummary}`);
  }

  if (params.newMessages.length === 0) {
    parts.push('There are no new messages since the last scan.');
  } else {
    const formatted = params.newMessages
      .map((m) => `[${m.timestamp.toISOString()}] ${m.sender}: ${m.content}`)
      .join('\n');
    parts.push(`New messages:\n${formatted}`);
  }

  parts.push(
    'Note: Only text messages are captured. Images, audio, and documents are not analyzed and may contain relevant information.',
  );

  return parts.join('\n\n');
}

export interface RunProfileOptions {
  db: Database;
  llm: LLMClient;
  profile: ScanProfile;
  accountId: number;
  groupId: string;
  scanWindowDays: number;
  skipEmptyDelivery: boolean;
  onResult: (output: string, profileId: string) => void;
  /** When set, overrides the normal "since last run" window with this exact cutoff date. */
  overrideSince?: Date;
}

/**
 * Executes a single profile run:
 * 1. Loads the previous summary and unprocessed messages from the DB.
 * 2. Builds the LLM prompt.
 * 3. Calls the LLM.
 * 4. Persists the result and marks messages as processed.
 * 5. Calls onResult so the caller can deliver the output.
 */
export async function runProfile(options: RunProfileOptions): Promise<void> {
  const { db, llm, profile, accountId, groupId, scanWindowDays, skipEmptyDelivery, onResult } =
    options;

  const lastResult = getLastScanResult(db, accountId, profile.id);
  const since =
    options.overrideSince ??
    ((): Date => {
      const windowFloor = new Date(Date.now() - scanWindowDays * 24 * 60 * 60 * 1000);
      const lastRunAt = lastResult?.timestamp ?? new Date(0);
      // Use the more recent of the two: don't look further back than the scan window.
      return lastRunAt > windowFloor ? lastRunAt : windowFloor;
    })();
  const newMessages = getMessagesSince(db, accountId, groupId, since);

  if (newMessages.length === 0 && skipEmptyDelivery) {
    console.info(
      logPrefix('scheduler', 'INFO'),
      `Profile "${profile.name}" — no new messages, skipping`,
    );
    return;
  }

  const prompt = `${profile.prompt}\n\n${buildLLMInput({
    previousSummary: lastResult?.output ?? null,
    newMessages,
  })}`;

  console.info(
    logPrefix('scheduler', 'INFO'),
    `Running profile "${profile.name}" — ${newMessages.length} new messages`,
  );

  let output: string;
  try {
    output = await llm.complete(prompt);
  } catch (error) {
    console.error(
      logPrefix('scheduler', 'ERROR'),
      `LLM call failed for profile "${profile.name}":`,
      error,
    );
    throw new Error(`Profile run failed for "${profile.name}": ${String(error)}`, { cause: error });
  }

  console.info(logPrefix('scheduler', 'INFO'), `Profile "${profile.name}" result:\n${output}`);

  const messageIds = newMessages.map((m) => m.id);

  insertScanResult(db, {
    accountId,
    profileId: profile.id,
    timestamp: new Date(),
    inputMessageIds: messageIds,
    previousSummary: lastResult?.output ?? null,
    output,
  });

  markMessagesProcessed(db, messageIds, profile.id);

  // Skip delivery if this is a "nothing urgent" response and skipEmptyDelivery is enabled.
  // Match case-insensitively and as a prefix since the LLM may append an explanation.
  if (skipEmptyDelivery && output.trim().toLowerCase().startsWith('nothing urgent')) {
    console.info(
      logPrefix('scheduler', 'INFO'),
      `Profile "${profile.name}" — "nothing urgent" response, skipping delivery`,
    );
    return;
  }

  onResult(output, profile.id);
}
