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

    this.setStatus('connecting');

    // Fetch the current WhatsApp Web version at connection time.
    // Without this, Baileys uses a hardcoded version that WhatsApp may reject
    // with statusCode 405 (Connection Failure) after protocol updates.
    const { version } = await fetchLatestWaWebVersion({});
    console.info(logPrefix('whatsapp', 'INFO'), `Using WA version: ${version.join('.')}`);

    this.socket = makeWASocket({ auth: state, version, printQRInTerminal: false });

    this.socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (typeof qr === 'string') {
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

        this.setStatus(isLoggedOut ? 'unlinked' : 'expired');

        if (!isLoggedOut) {
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

    this.socket.ev.on('creds.update', () => {
      void saveCreds();
    });

    this.socket.ev.on('messages.upsert', (event: BaileysEventMap['messages.upsert']) => {
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
      await this.socket.logout();
      this.socket = null;
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
