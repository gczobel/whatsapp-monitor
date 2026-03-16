import { join } from 'node:path';
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
import { logPrefix } from '../utils.js';

/**
 * Parses a raw Baileys message into a NewMessage, or returns null if the
 * message should be ignored (non-group, non-text, etc.).
 * Exported as a pure function so it can be unit-tested without Baileys.
 */
export function parseIncomingMessage(
  accountId: number,
  msg: BaileysEventMap['messages.upsert']['messages'][number],
): NewMessage | null {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid?.endsWith('@g.us')) return null;

  const content = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
  if (!content) return null;

  const timestamp =
    typeof msg.messageTimestamp === 'number' ? new Date(msg.messageTimestamp * 1000) : new Date();

  return {
    accountId,
    groupId: remoteJid,
    timestamp,
    sender: msg.pushName ?? 'unknown',
    content,
  };
}

export interface SessionCallbacks {
  onQRCode: (qr: string) => void;
  onStatusChange: (status: SessionStatus) => void;
  onMessage: (message: NewMessage) => void;
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
  // Cached after first fetch — the WA protocol version is stable within a session.
  private waVersion: [number, number, number] | null = null;

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

    // Capture socket identity so stale-socket events can be ignored (see guards below).
    // Without this, a close event from an old socket triggers another connect() call,
    // causing a rapid reconnect cascade.
    const sock = makeWASocket({ auth: state, version: this.waVersion, printQRInTerminal: false });
    this.socket = sock;

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
          // Don't change status during background reconnects — the session is still
          // effectively linked until proven otherwise (e.g. QR is needed again).
          console.info(logPrefix('whatsapp', 'INFO'), 'Reconnecting…');
          void this.connect();
        }
      }

      if (connection === 'open') {
        this.lastQRCode = null;
        this.setStatus('linked');
        console.info(logPrefix('whatsapp', 'INFO'), `Session linked for account ${this.accountId}`);
      }
    });

    sock.ev.on('creds.update', () => {
      if (sock !== this.socket) return;
      void saveCreds();
    });

    sock.ev.on('messages.upsert', (event: BaileysEventMap['messages.upsert']) => {
      if (sock !== this.socket) return;
      if (event.type !== 'notify') return;
      for (const msg of event.messages) {
        this.handleIncomingMessage(msg);
      }
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

  async disconnect(): Promise<void> {
    if (this.socket !== null) {
      // Null out this.socket before calling logout so the 'close' event handler
      // (which checks sock !== this.socket) ignores the close and does not reconnect.
      const sock = this.socket;
      this.socket = null;
      await sock.logout();
    }
    this.setStatus('unlinked');
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
