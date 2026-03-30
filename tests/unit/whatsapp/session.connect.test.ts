import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { WhatsAppSession } from '../../../src/whatsapp/session.js';
import type { SessionCallbacks } from '../../../src/whatsapp/session.js';
import { createTestDatabase, seedAccount } from '../../fixtures/index.js';

// ── fs mock (for handleSessionCorruption assertions) ─────────────────────────
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(undefined),
  };
});

// ── Baileys mock ──────────────────────────────────────────────────────────────
// vi.hoisted() runs before vi.mock() factories so variables can be referenced.

const { mockSocket, mockSaveCreds, mockFetchVersion, handlers } = vi.hoisted(() => {
  const handlers: Record<string, (data: unknown) => void> = {};
  const mockSaveCreds = vi.fn().mockResolvedValue(undefined);
  const mockFetchVersion = vi.fn().mockResolvedValue({ version: [2, 3000, 0] });
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
  return { mockSocket, mockSaveCreds, mockFetchVersion, handlers };
});

vi.mock('@whiskeysockets/baileys', () => ({
  default: vi.fn().mockReturnValue(mockSocket),
  useMultiFileAuthState: vi.fn().mockResolvedValue({
    state: {},
    saveCreds: mockSaveCreds,
  }),
  fetchLatestWaWebVersion: mockFetchVersion,
  DisconnectReason: {},
}));

const { mockQRToDataURL } = vi.hoisted(() => ({
  mockQRToDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQRdata'),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: mockQRToDataURL },
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
  const session = new WhatsAppSession(1, '/tmp', db, callbacks as SessionCallbacks);
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
  it('should not set status to connecting until a QR code arrives', async () => {
    // 'connecting' only fires when a QR is shown — not on every connect() call.
    // This prevents the setup page from showing QR-mode during silent reconnects.
    const callbacks = makeCallbacks();
    const session = new WhatsAppSession(1, '/tmp', db, callbacks);
    await session.connect();
    expect(callbacks.onStatusChange).not.toHaveBeenCalledWith('connecting');
  });

  it('should set status to connecting when a QR event fires', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('connection.update', { qr: 'test-qr-string' });
    await Promise.resolve();
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('connecting');
  });

  it('should set status to linked on connection.update open', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    fire('connection.update', { connection: 'open' });
    expect(session.getStatus()).toBe('linked');
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('linked');
  });

  it('should call onQRCode with a PNG data URL when a QR string arrives', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('connection.update', { qr: 'test-qr-string' });
    // toDataURL is async; flush microtasks before asserting
    await Promise.resolve();
    expect(callbacks.onQRCode).toHaveBeenCalledWith('data:image/png;base64,mockQRdata');
  });

  it('should cache the data URL so getLastQR returns it after a qr event', async () => {
    const session = await makeConnectedSession(db, makeCallbacks());
    expect(session.getLastQR()).toBeNull();
    fire('connection.update', { qr: 'test-qr-string' });
    await Promise.resolve();
    expect(session.getLastQR()).toBe('data:image/png;base64,mockQRdata');
  });

  it('should clear the cached QR when connection opens', async () => {
    const session = await makeConnectedSession(db, makeCallbacks());
    fire('connection.update', { qr: 'test-qr-string' });
    await Promise.resolve();
    fire('connection.update', { connection: 'open' });
    expect(session.getLastQR()).toBeNull();
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

  it('should not change status on unexpected close (silent reconnect)', async () => {
    // Non-logout closes trigger a silent reconnect without changing status,
    // preventing the setup page from briefly showing QR-mode between reconnects.
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    fire('connection.update', { connection: 'open' }); // establish 'linked'
    const callsBefore = callbacks.onStatusChange.mock.calls.length;
    fire('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 503 } } },
    });
    expect(session.getStatus()).toBe('linked');
    expect(callbacks.onStatusChange.mock.calls.length).toBe(callsBefore);
  });

  it('should not change status when lastDisconnect has no error', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    fire('connection.update', { connection: 'open' }); // establish 'linked'
    const callsBefore = callbacks.onStatusChange.mock.calls.length;
    fire('connection.update', { connection: 'close' });
    expect(session.getStatus()).toBe('linked');
    expect(callbacks.onStatusChange.mock.calls.length).toBe(callsBefore);
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

  it('should process messages.upsert events of type append (history on reconnect)', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('messages.upsert', {
      type: 'append',
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
  });

  it('should ignore messages.upsert events that are not notify or append', async () => {
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('messages.upsert', {
      type: 'set',
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

  it('should complete cleanup even when logout() throws (Bug 7)', async () => {
    mockSocket.logout.mockRejectedValueOnce(new Error('socket already closed'));
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    await session.disconnect();
    expect(session.getStatus()).toBe('unlinked');
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('unlinked');
  });
});

// ── reconnect counter — status-code-aware (Bugs 3, 8) ───────────────────────

describe('WhatsAppSession reconnect counter', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  function fireClose(statusCode: number | undefined): void {
    fire('connection.update', {
      connection: 'close',
      lastDisconnect:
        statusCode !== undefined ? { error: { output: { statusCode } } } : { error: {} },
    });
  }

  // Each fireClose triggers void this.connect() which is async. We must flush
  // microtasks between fires so the reconnect completes and the next close event
  // is processed by the new socket's handler (not blocked by the stale-socket guard).
  async function fireCloseAndFlush(statusCode: number | undefined): Promise<void> {
    fireClose(statusCode);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('should NOT trigger session corruption after 5+ QR timeouts (Bug 3)', async () => {
    await makeConnectedSession(db, makeCallbacks());
    for (let i = 0; i < 7; i++) {
      await fireCloseAndFlush(408);
    }
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should NOT trigger session corruption after 5+ stream errors (515)', async () => {
    await makeConnectedSession(db, makeCallbacks());
    for (let i = 0; i < 7; i++) {
      await fireCloseAndFlush(515);
    }
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should treat 440 (connectionReplaced) as logout — no reconnect', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    fireClose(440);
    expect(session.getStatus()).toBe('unlinked');
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('unlinked');
  });

  it('should treat 500 (badSession) as corruption — trigger cleanup directly', async () => {
    await makeConnectedSession(db, makeCallbacks());
    fireClose(500);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should reach linked after 4x 408 + 1x 515 + open (Bug 8)', async () => {
    const callbacks = makeCallbacks();
    const session = await makeConnectedSession(db, callbacks);
    for (let i = 0; i < 4; i++) {
      await fireCloseAndFlush(408);
    }
    await fireCloseAndFlush(515);
    fire('connection.update', { connection: 'open' });
    expect(session.getStatus()).toBe('linked');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should trigger corruption after 5 genuine network failures', async () => {
    await makeConnectedSession(db, makeCallbacks());
    for (let i = 0; i < 5; i++) {
      await fireCloseAndFlush(undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ── error handling (Bugs 4, 5) ───────────────────────────────────────────────

describe('WhatsAppSession error handling', () => {
  it('should retry connect after 5s when fetchLatestWaWebVersion throws (Bug 4)', async () => {
    vi.useFakeTimers();
    mockFetchVersion.mockRejectedValueOnce(new Error('CDN unreachable'));
    const callbacks = makeCallbacks();
    const session = new WhatsAppSession(1, '/tmp', db, callbacks as SessionCallbacks);
    await session.connect();
    // connect() should have returned early without creating a socket
    expect(session.getStatus()).toBe('unlinked');
    // Advance past the 5s retry timer
    mockFetchVersion.mockResolvedValueOnce({ version: [2, 3000, 0] });
    await vi.advanceTimersByTimeAsync(5_000);
    // After retry, session should have connected (socket events registered)
    expect(mockSocket.ev.on).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should log error but not crash when QRCode.toDataURL rejects (Bug 5)', async () => {
    mockQRToDataURL.mockRejectedValueOnce(new Error('QR generation failed'));
    const callbacks = makeCallbacks();
    await makeConnectedSession(db, callbacks);
    fire('connection.update', { qr: 'test-qr-string' });
    await Promise.resolve();
    // onQRCode should NOT have been called since toDataURL failed
    expect(callbacks.onQRCode).not.toHaveBeenCalled();
  });
});
