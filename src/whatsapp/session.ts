import { join } from 'node:path';
import { rm, readdir } from 'node:fs/promises';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  DisconnectReason,
  type WASocket,
  type ConnectionState,
  type BaileysEventMap,
} from '@whiskeysockets/baileys';
import type { Database } from 'better-sqlite3';
import type { WhatsAppGroup, NewMessage, SessionStatus } from '../types.js';
import { insertMessage } from '../db/messages.js';
import { clearMonitoredGroup } from '../db/accounts.js';
import { logPrefix } from '../utils.js';
import { parseIncomingMessage } from './message-parser.js';
import { HistorySyncTracker } from './history-sync.js';

export interface SessionCallbacks {
  onQRCode: (qr: string) => void;
  onStatusChange: (status: SessionStatus) => void;
  onMessage: (message: NewMessage) => void;
  /** Fired when history sync completes (isLatest: true) or after a 30s timeout on reconnect. */
  onHistorySyncComplete?: () => void;
}

/**
 * Manages a single WhatsApp account session via Baileys.
 *
 * Lifecycle:
 *  1. Constructed with account config and callbacks.
 *  2. connect() starts the Baileys socket and emits QR codes or restores session.
 *  3. disconnect() gracefully closes the socket.
 *
 * Session files are persisted under sessionsPath/<accountId>/ so that
 * re-scanning is not required on app restart (NF6).
 */
export class WhatsAppSession {
  private readonly accountId: number;
  private readonly sessionDir: string;
  private readonly db: Database;
  private readonly callbacks: SessionCallbacks;
  private status: SessionStatus = 'unlinked';
  private socket: WASocket | null = null;
  private lastQRCode: string | null = null;
  private historySync: HistorySyncTracker | null = null;
  // Cached after first fetch; reset to null on 405 so the next reconnect re-fetches.
  private waVersion: [number, number, number] | null = null;
  private sessionCorruptionHandled = false;
  private reconnectAttempts = 0;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;

  constructor(accountId: number, sessionsPath: string, db: Database, callbacks: SessionCallbacks) {
    this.accountId = accountId;
    this.sessionDir = join(sessionsPath, String(accountId));
    this.db = db;
    this.callbacks = callbacks;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  getLastQR(): string | null {
    return this.lastQRCode;
  }

  isSyncing(): boolean {
    return this.historySync?.isSyncing() ?? false;
  }

  getSyncedMessageCount(): number {
    return this.historySync?.getSyncedMessageCount() ?? 0;
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

    // Fetch the current WhatsApp Web version once per session lifetime.
    // Without this, Baileys uses a hardcoded version that WhatsApp may reject
    // with statusCode 405 (Connection Failure) after protocol updates.
    if (this.waVersion === null) {
      const { version } = await fetchLatestWaWebVersion({});
      this.waVersion = version;
      console.info(logPrefix('whatsapp', 'INFO'), `Using WA version: ${version.join('.')}`);
    }

    // Custom logger: silences Baileys' verbose Pino output and intercepts decryption
    // failures so we can auto-recover from corrupted Signal sessions.
    const noop = (): void => {};
    const baileysLogger = {
      level: 'silent',
      trace: noop,
      debug: noop,
      info: noop,
      warn: noop,
      fatal: noop,
      error: (data: unknown, message?: string): void => {
        const err = (data as { err?: { message?: string } } | undefined)?.err;
        console.error(
          logPrefix('whatsapp', 'ERROR'),
          `[baileys] ${message ?? String(data)}`,
          err?.message ? `(${err.message})` : '',
        );
        if (message === 'failed to decrypt message') {
          this.handleSessionCorruption();
        }
      },
      child: (): unknown => baileysLogger,
    };

    // Capture socket identity so stale-socket events can be ignored (see guards below).
    // Without this, a close event from an old socket triggers another connect() call,
    // causing a rapid reconnect cascade.
    const sock = makeWASocket({
      auth: state,
      version: this.waVersion,
      logger: baileysLogger as unknown as NonNullable<Parameters<typeof makeWASocket>[0]['logger']>,
      printQRInTerminal: false,
      // Request history sync so the phone pushes message history on a fresh QR link.
      // Only accept RECENT chunks to avoid pulling years of history.
      // On reconnects this has no effect — WhatsApp skips the sync and Baileys times out.
      syncFullHistory: true,
      shouldSyncHistoryMessage: (msg) => Number(msg.syncType) === 3, // 3 = RECENT per proto enum
    });
    this.socket = sock;

    const historySync = new HistorySyncTracker(
      this.accountId,
      (msg) => this.handleIncomingMessage(msg),
      this.callbacks.onHistorySyncComplete,
    );
    this.historySync = historySync;

    sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      if (sock !== this.socket) return; // stale socket — superseded by a newer connect() call

      const { connection, lastDisconnect, qr } = update;

      if (typeof qr === 'string') {
        // Status only becomes 'connecting' when a QR is actually needed.
        // This avoids flipping the UI to QR-mode during silent background reconnects.
        this.setStatus('connecting');
        // Convert raw Baileys QR string to a PNG data URL server-side so the
        // browser can render it with a plain <img> tag — no client-side library needed.
        void QRCode.toDataURL(qr, { margin: 1, width: 220 }).then((dataURL) => {
          console.info(logPrefix('whatsapp', 'INFO'), 'QR code generated — waiting for scan');
          this.lastQRCode = dataURL;
          this.callbacks.onQRCode(dataURL);
        });
      }

      if (connection === 'close') {
        const error = lastDisconnect?.error as
          | { output?: { statusCode?: number }; message?: string }
          | undefined;
        const statusCode = error?.output?.statusCode;
        const errorMessage = error?.message ?? 'unknown';
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        console.info(
          logPrefix('whatsapp', 'INFO'),
          `Connection closed — statusCode: ${String(statusCode)}, error: ${errorMessage}`,
        );

        // Null the socket immediately so that any further events emitted by this
        // dying socket (possible during Baileys' async close sequence) hit the
        // stale-socket guard at the top and do not spawn additional reconnects.
        this.socket = null;

        if (isLoggedOut) {
          this.setStatus('unlinked');
        } else {
          // 405 = WhatsApp rejected our protocol version — reset so next connect re-fetches.
          if (statusCode === 405) {
            this.waVersion = null;
          }
          this.reconnectAttempts++;
          if (this.reconnectAttempts >= WhatsAppSession.MAX_RECONNECT_ATTEMPTS) {
            console.error(
              logPrefix('whatsapp', 'ERROR'),
              `${this.reconnectAttempts} consecutive reconnect failures — clearing session and restarting…`,
            );
            this.handleSessionCorruption();
          } else {
            // Don't change status during background reconnects — the session is still
            // effectively linked until proven otherwise (e.g. QR is needed again).
            console.info(logPrefix('whatsapp', 'INFO'), 'Reconnecting…');
            void this.connect();
          }
        }
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.lastQRCode = null;
        this.setStatus('linked');
        console.info(logPrefix('whatsapp', 'INFO'), `Session linked for account ${this.accountId}`);

        // Fallback: if no history sync completes within 30s (e.g. reconnect, not fresh link),
        // fire onHistorySyncComplete so the scheduler starts without waiting forever.
        setTimeout(() => {
          historySync.completeFallback();
        }, 30_000);
      }
    });

    sock.ev.on('creds.update', () => {
      if (sock !== this.socket) return;
      void saveCreds();
    });

    sock.ev.on('messages.upsert', (event: BaileysEventMap['messages.upsert']) => {
      if (sock !== this.socket) return;
      // Handle both 'notify' (real-time) and 'append' (history sync on reconnect).
      // 'append' delivers messages missed during downtime; INSERT OR IGNORE prevents duplicates.
      if (event.type !== 'notify' && event.type !== 'append') return;
      for (const msg of event.messages) {
        this.handleIncomingMessage(msg);
      }
    });

    sock.ev.on('messaging-history.set', (event: BaileysEventMap['messaging-history.set']) => {
      if (sock !== this.socket) return;
      historySync.handleBatch(event);
    });
  }

  async listGroups(): Promise<WhatsAppGroup[]> {
    if (this.socket === null) return [];
    const groups = await this.socket.groupFetchAllParticipating();
    return Object.entries(groups).map(([id, g]) => ({
      id,
      name: g.subject,
      participantCount: g.participants.length,
    }));
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (this.socket === null) {
      throw new Error('[whatsapp] Cannot send message — session is not connected');
    }
    await this.socket.sendMessage(jid, { text });
  }

  /**
   * Closes the current socket and reconnects, forcing Signal session renegotiation.
   * Used by the delivery layer to recover from broken encryption sessions.
   */
  async reconnect(): Promise<void> {
    console.info(
      logPrefix('whatsapp', 'INFO'),
      'Forcing session reconnect… (resetting status to connecting)',
    );
    // Null first so the 'connection.update' close handler sees a stale socket
    // and does not spawn a second reconnect in parallel with ours.
    this.socket = null;
    // Reset status so waitForLinked() polls until the NEW socket reaches 'linked'.
    // Without this, status remains 'linked' from the old socket and waitForLinked()
    // returns a false positive — sendMessage() then tries the not-yet-ready socket,
    // throws, and sender.ts fires a second reconnect(), causing a two-socket race.
    this.status = 'connecting';
    // The old socket will close itself. The stale-socket guard in the
    // 'connection.update' handler (sock !== this.socket) prevents its
    // close event from triggering another reconnect.
    await this.connect();
  }

  /**
   * Resolves true once the session reaches 'linked', or false after timeoutMs.
   */
  async waitForLinked(timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.status === 'linked') return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  async disconnect(): Promise<void> {
    if (this.socket !== null) {
      // Null out this.socket before calling logout so the 'close' event handler
      // (which checks sock !== this.socket) ignores the close and does not reconnect.
      const sock = this.socket;
      this.socket = null;
      await sock.logout();
    }
    // Wipe session files so the next connect() starts fresh and generates a QR.
    await rm(this.sessionDir, { recursive: true, force: true });
    // Clear group selection — a different phone may not have the same groups.
    clearMonitoredGroup(this.db, this.accountId);
    this.setStatus('unlinked');
  }

  private handleSessionCorruption(): void {
    if (this.sessionCorruptionHandled) return;
    this.sessionCorruptionHandled = true;
    console.error(
      logPrefix('whatsapp', 'ERROR'),
      'Signal session corruption detected — clearing sessions and restarting…',
    );
    readdir(this.sessionDir)
      .then((files) =>
        Promise.all(
          files.filter((f) => f !== 'creds.json').map((f) => rm(join(this.sessionDir, f))),
        ),
      )
      .then(() => {
        console.info(
          logPrefix('whatsapp', 'INFO'),
          'Sessions cleared — exiting for container restart',
        );
        process.exit(1);
      })
      .catch((err) => {
        console.error(logPrefix('whatsapp', 'ERROR'), 'Failed to clear sessions:', err);
        process.exit(1);
      });
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  private handleIncomingMessage(msg: BaileysEventMap['messages.upsert']['messages'][number]): void {
    const newMessage = parseIncomingMessage(this.accountId, msg);
    if (!newMessage) return;
    insertMessage(this.db, newMessage);
    this.callbacks.onMessage(newMessage);
  }
}
