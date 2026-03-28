import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppSession } from '../../../src/whatsapp/session.js';
import type { SessionCallbacks } from '../../../src/whatsapp/session.js';
import { createTestDatabase } from '../../fixtures/index.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readdir: vi.fn(), rm: vi.fn() };
});

// Import after mock so we get the mocked versions
import { readdir, rm } from 'node:fs/promises';

describe('WhatsAppSession', () => {
  it('should start with status "unlinked"', () => {
    const db = createTestDatabase();
    const session = new WhatsAppSession(1, '/tmp', db, {
      onQRCode: vi.fn(),
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
    });
    expect(session.getStatus()).toBe('unlinked');
  });

  it('should return empty array from listGroups when not connected', async () => {
    const db = createTestDatabase();
    const session = new WhatsAppSession(1, '/tmp', db, {
      onQRCode: vi.fn(),
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
    });
    const groups = await session.listGroups();
    expect(groups).toEqual([]);
  });

  it('should throw from sendMessage when not connected', async () => {
    const db = createTestDatabase();
    const session = new WhatsAppSession(1, '/tmp', db, {
      onQRCode: vi.fn(),
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
    });
    await expect(session.sendMessage('jid@s.whatsapp.net', 'hello')).rejects.toThrow(
      'not connected',
    );
  });

  it('should call onStatusChange callback when disconnect is called while not connected', async () => {
    const db = createTestDatabase();
    const onStatusChange = vi.fn();
    const session = new WhatsAppSession(1, '/tmp', db, {
      onQRCode: vi.fn(),
      onStatusChange,
      onMessage: vi.fn(),
    } as SessionCallbacks);
    await session.disconnect();
    expect(onStatusChange).toHaveBeenCalledWith('unlinked');
  });

  it('should return isSyncing false and getSyncedMessageCount 0 before connect', () => {
    const db = createTestDatabase();
    const session = new WhatsAppSession(1, '/tmp', db, {
      onQRCode: vi.fn(),
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
    });
    expect(session.isSyncing()).toBe(false);
    expect(session.getSyncedMessageCount()).toBe(0);
  });

  it('waitForLinked should return false immediately when status never becomes linked', async () => {
    const db = createTestDatabase();
    const session = new WhatsAppSession(1, '/tmp', db, {
      onQRCode: vi.fn(),
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
    });
    // Status is 'unlinked' — use a very short timeout so the test doesn't block
    const result = await session.waitForLinked(100);
    expect(result).toBe(false);
  });

  describe('handleSessionCorruption()', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      vi.mocked(rm).mockResolvedValue(undefined);
    });

    it('should delete all session files except creds.json then exit', async () => {
      vi.mocked(readdir).mockResolvedValue([
        'creds.json',
        'session-abc.json',
        'pre-key-1.json',
      ] as never);
      const db = createTestDatabase();
      const session = new WhatsAppSession(1, '/tmp/sessions', db, {
        onQRCode: vi.fn(),
        onStatusChange: vi.fn(),
        onMessage: vi.fn(),
      });
      // Access private method via type escape
      (session as unknown as { handleSessionCorruption: () => void }).handleSessionCorruption();
      await new Promise((resolve) => setTimeout(resolve, 0)); // flush promise queue

      expect(vi.mocked(rm)).toHaveBeenCalledWith('/tmp/sessions/1/session-abc.json');
      expect(vi.mocked(rm)).toHaveBeenCalledWith('/tmp/sessions/1/pre-key-1.json');
      expect(vi.mocked(rm)).not.toHaveBeenCalledWith(
        expect.stringContaining('creds.json') as string,
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should be idempotent — second call does nothing', async () => {
      vi.mocked(readdir).mockResolvedValue(['session-abc.json'] as never);
      const db = createTestDatabase();
      const session = new WhatsAppSession(1, '/tmp/sessions', db, {
        onQRCode: vi.fn(),
        onStatusChange: vi.fn(),
        onMessage: vi.fn(),
      });
      const callCorruption = (
        session as unknown as {
          handleSessionCorruption: () => void;
        }
      ).handleSessionCorruption.bind(session);

      callCorruption();
      callCorruption(); // second call must be a no-op
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vi.mocked(readdir)).toHaveBeenCalledOnce();
      expect(exitSpy).toHaveBeenCalledOnce();
    });
  });
});
