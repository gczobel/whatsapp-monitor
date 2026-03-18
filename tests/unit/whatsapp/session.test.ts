import { describe, it, expect, vi } from 'vitest';
import { WhatsAppSession } from '../../../src/whatsapp/session.js';
import type { SessionCallbacks } from '../../../src/whatsapp/session.js';
import { createTestDatabase } from '../../fixtures/index.js';

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
});
