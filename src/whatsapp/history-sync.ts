import type { BaileysEventMap } from '@whiskeysockets/baileys';
import { parseIncomingMessage } from './message-parser.js';
import { logPrefix } from '../utils.js';

type RawMsg = BaileysEventMap['messages.upsert']['messages'][number];

/**
 * Tracks WhatsApp history sync state and processes messaging-history.set batches.
 *
 * On a fresh QR link, WhatsApp pushes recent message history before the scheduler
 * should start. HistorySyncTracker holds the sync state and fires onSyncComplete
 * when the final batch (isLatest: true) arrives, or via completeFallback() if the
 * sync never completes (reconnect path — 30s timeout).
 */
export class HistorySyncTracker {
  private syncing = false;
  private syncedMessageCount = 0;
  private done = false;

  constructor(
    private readonly accountId: number,
    private readonly onHandleMessage: (msg: RawMsg) => void,
    private readonly onSyncComplete: (() => void) | undefined,
  ) {}

  isSyncing(): boolean {
    return this.syncing;
  }

  getSyncedMessageCount(): number {
    return this.syncedMessageCount;
  }

  handleBatch(event: BaileysEventMap['messaging-history.set']): void {
    const total = event.messages.length;
    let captured = 0;
    for (const msg of event.messages) {
      if (parseIncomingMessage(this.accountId, msg) !== null) captured++;
      this.onHandleMessage(msg);
    }
    this.syncedMessageCount += captured;

    console.info(
      logPrefix('whatsapp', 'INFO'),
      `History sync — batch: ${captured}/${total} captured, total: ${this.syncedMessageCount}, progress: ${String(event.progress ?? 'n/a')}, isLatest: ${String(event.isLatest)}`,
    );

    if (!this.done) {
      if (!this.syncing) {
        this.syncing = true;
        console.info(logPrefix('whatsapp', 'INFO'), 'History sync started');
      }
      // isLatest is a known Baileys bug — it fires on the FIRST batch, not the last.
      // progress === 100 is the reliable completion signal (added in Baileys PR #1042).
      // Fall back to isLatest only if progress is not provided by this Baileys version.
      const isSyncDone =
        event.progress === 100 || (event.progress == null && event.isLatest === true);
      if (isSyncDone) {
        this.done = true;
        this.syncing = false;
        console.info(
          logPrefix('whatsapp', 'INFO'),
          `History sync complete — ${this.syncedMessageCount} group text messages captured`,
        );
        this.onSyncComplete?.();
      }
    }
  }

  /**
   * Called from the 30s timeout fallback in session.connect() when no history sync arrives.
   * Returns true if this was the first completion (i.e., action was taken).
   */
  completeFallback(): boolean {
    if (this.done) return false;
    this.done = true;
    this.syncing = false;
    if (this.syncedMessageCount > 0) {
      console.info(
        logPrefix('whatsapp', 'INFO'),
        `History sync timed out — ${this.syncedMessageCount} messages captured so far, starting scheduler`,
      );
    } else {
      console.info(logPrefix('whatsapp', 'INFO'), 'No history sync — starting normally');
    }
    this.onSyncComplete?.();
    return true;
  }
}
