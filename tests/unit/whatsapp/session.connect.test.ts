import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { WhatsAppSession } from '../../../src/whatsapp/session.js';
import { createTestDatabase, seedAccount } from '../../fixtures/index.js';

// ── Baileys mock ──────────────────────────────────────────────────────────────
// vi.hoisted() runs before vi.mock() factories so variables can be referenced.

const { mockSocket, mockSaveCreds, handlers } = vi.hoisted(() => {
  const handlers: Record<string, (data: unknown) => void> = {};
  const mockSaveCreds = vi.fn().mockResolvedValue(undefined);
  const mockSocket = {
    ev: {
      on: vi.fn((event: string, handler: (data: unknown) => void): void => {
        handlers[event] = handler;
      }),
    },
    groupFetchAllParticipating: vi.fn().mockResolvedValue({
      'group1@g.us': { subject: 'Group One', participants: [{}, {}, {}] },
    }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  return { mockSocket, mockSaveCreds, handlers };
});

vi.mock('@whiskeysockets/baileys', () => ({
  default: vi.fn().mockReturnValue(mockSocket),
  useMultiFileAuthState: vi.fn().mockResolvedValue({
    state: {},
    saveCreds: mockSaveCreds,
  }),
  DisconnectReason: { loggedOut: 401 },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

interface Callbacks {
  onQRCode: ReturnType<typeof vi.fn>;
  onStatusChange: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
}

function makeCallbacks(): Callbacks {
  return { onQRCode: vi.fn(), onStatusChange: vi.fn(), onMessage: vi.fn() };
}

async function makeConnectedSession(db: Database, callbacks: Callbacks): Promise<WhatsAppSession> {
  const session = new WhatsAppSession(1, '/tmp', db, callbacks);
  await session.connect();
  return session;
}

function fire(event: string, data: unknown): void {
  (handlers[event] as ((d: unknown) => void) | undefined)?.(data);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
  mockSocket.ev.on.mockImplementation((event: string, handler: (data: unknown) => void): void => {
    handlers[event] = handler;
  });
  db = createTestDatabase();
  seedAccount(db);
});

// ── connect() ─────────────────────────────────────────────────────────────────

describe('WhatsAppSession.connect()', () => {
  it('should set status to connecting immediately', async () => {
    const callbacks = makeCallbacks();
    const session = new WhatsAppSession(1, '/tmp', db, callbacks);
    await session.connect();
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('connecting');
  });

  it('should set status to linked on connection.update open', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    fire('connection.update', { connection: 'open' });
    expect(session.getStatus()).toBe('linked');
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('linked');
  });

  it('should call onQRCode when a QR string arrives', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('connection.update', { qr: 'test-qr-string' });
    expect(callbacks.onQRCode).toHaveBeenCalledWith('test-qr-string');
  });

  it('should not call onQRCode when qr field is absent', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('connection.update', { connection: 'open' });
    expect(callbacks.onQRCode).not.toHaveBeenCalled();
  });

  it('should set status to unlinked and not reconnect on logout close', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    const callsBefore = mockSocket.ev.on.mock.calls.length;
    fire('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });
    expect(session.getStatus()).toBe('unlinked');
    expect(mockSocket.ev.on.mock.calls.length).toBe(callsBefore);
  });

  it('should set status to expired on unexpected close', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    fire('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 503 } } },
    });
    expect(session.getStatus()).toBe('expired');
  });

  it('should set status to expired when lastDisconnect has no error', async () => {
    const session = await makeConnectedSession(db, makeCallbacks());
    fire('connection.update', { connection: 'close' });
    expect(session.getStatus()).toBe('expired');
  });

  it('should call saveCreds when creds.update fires', async () => {
    await makeConnectedSession(db, makeCallbacks());
    await (handlers['creds.update'] as (() => Promise<void>) | undefined)?.();
    expect(mockSaveCreds).toHaveBeenCalledOnce();
  });

  it('should persist a group message and call onMessage', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { remoteJid: '12345@g.us', id: 'id1', fromMe: false },
          message: { conversation: 'Hello!' },
          messageTimestamp: 1700000000,
          pushName: 'Sender',
        },
      ],
    });
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    const row = db.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number };
    expect(row.n).toBe(1);
  });

  it('should ignore messages.upsert events that are not type notify', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('messages.upsert', {
      type: 'append',
      messages: [
        {
          key: { remoteJid: '12345@g.us', id: 'id1', fromMe: false },
          message: { conversation: 'Hello!' },
          messageTimestamp: 1700000000,
        },
      ],
    });
    expect(callbacks.onMessage).not.toHaveBeenCalled();
  });
});

// ── listGroups() — connected ──────────────────────────────────────────────────

describe('WhatsAppSession.listGroups() — connected', () => {
  it('should return groups from the socket', async () => {
    const session = await makeConnectedSession(db, makeCallbacks());
    const groups = await session.listGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('group1@g.us');
    expect(groups[0]?.name).toBe('Group One');
    expect(groups[0]?.participantCount).toBe(3);
  });
});

// ── sendMessage() — connected ─────────────────────────────────────────────────

describe('WhatsAppSession.sendMessage() — connected', () => {
  it('should delegate to socket.sendMessage', async () => {
    const session = await makeConnectedSession(db, makeCallbacks());
    await session.sendMessage('jid@s.whatsapp.net', 'hello there');
    expect(mockSocket.sendMessage).toHaveBeenCalledWith('jid@s.whatsapp.net', {
      text: 'hello there',
    });
  });
});

// ── disconnect() — connected ──────────────────────────────────────────────────

describe('WhatsAppSession.disconnect() — connected', () => {
  it('should call socket.logout and set status to unlinked', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    await session.disconnect();
    expect(mockSocket.logout).toHaveBeenCalledOnce();
    expect(session.getStatus()).toBe('unlinked');
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('unlinked');
  });
});
