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

  return parts.join('\n\n');
}

export interface RunProfileOptions {
  db: Database;
  llm: LLMClient;
  profile: ScanProfile;
  accountId: number;
  groupId: string;
  onResult: (output: string, profileId: string) => void;
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
  const { db, llm, profile, accountId, groupId, onResult } = options;

  const lastResult = getLastScanResult(db, accountId, profile.id);
  const since = lastResult?.timestamp ?? new Date(0);
  const newMessages = getMessagesSince(db, accountId, groupId, since);

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
  onResult(output, profile.id);
}
