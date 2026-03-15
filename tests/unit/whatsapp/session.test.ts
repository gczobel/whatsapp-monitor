import { describe, it, expect, vi } from 'vitest';
import { parseIncomingMessage, WhatsAppSession } from '../../../src/whatsapp/session.js';
import { createTestDatabase } from '../../fixtures/index.js';
import type { BaileysEventMap } from '@whiskeysockets/baileys';

type RawMsg = BaileysEventMap['messages.upsert']['messages'][number];

function makeMsg(overrides: Partial<RawMsg> = {}): RawMsg {
  return {
    key: { remoteJid: '1234567890@g.us', id: 'msg-id', fromMe: false },
    message: { conversation: 'Hello group' },
    messageTimestamp: 1700000000,
    pushName: 'Yossi',
    ...overrides,
  } as unknown as RawMsg;
}

describe('parseIncomingMessage', () => {
  it('should return a NewMessage for a valid group text message', () => {
    const result = parseIncomingMessage(1, makeMsg());
    expect(result).not.toBeNull();
    expect(result?.accountId).toBe(1);
    expect(result?.groupId).toBe('1234567890@g.us');
    expect(result?.content).toBe('Hello group');
    expect(result?.sender).toBe('Yossi');
  });

  it('should return null for non-group JIDs', () => {
    const msg = makeMsg({
      key: { remoteJid: '972501234567@s.whatsapp.net', id: 'id', fromMe: false },
    });
    expect(parseIncomingMessage(1, msg)).toBeNull();
  });

  it('should return null when remoteJid is null', () => {
    const msg = makeMsg({ key: { remoteJid: null, id: 'id', fromMe: false } });
    expect(parseIncomingMessage(1, msg)).toBeNull();
  });

  it('should return null when message has no text content', () => {
    const msg = makeMsg({ message: { imageMessage: {} } } as unknown as Partial<RawMsg>);
    expect(parseIncomingMessage(1, msg)).toBeNull();
  });

  it('should return null when message field is null', () => {
    const msg = makeMsg({ message: null } as unknown as Partial<RawMsg>);
    expect(parseIncomingMessage(1, msg)).toBeNull();
  });

  it('should extract text from extendedTextMessage', () => {
    const msg = makeMsg({
      message: { extendedTextMessage: { text: 'Extended text' } },
    } as unknown as Partial<RawMsg>);
    const result = parseIncomingMessage(1, msg);
    expect(result?.content).toBe('Extended text');
  });

  it('should convert numeric messageTimestamp to milliseconds', () => {
    const msg = makeMsg({ messageTimestamp: 1700000000 });
    const result = parseIncomingMessage(1, msg);
    expect(result?.timestamp).toEqual(new Date(1700000000 * 1000));
  });

  it('should fall back to current time when messageTimestamp is not a number', () => {
    const before = Date.now();
    const msg = makeMsg({ messageTimestamp: undefined } as unknown as Partial<RawMsg>);
    const result = parseIncomingMessage(1, msg);
    const after = Date.now();
    expect(result?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(result?.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it('should use "unknown" as sender when pushName is absent', () => {
    // Build a raw object without pushName, then cast through unknown
    const raw = {
      key: { remoteJid: '1234567890@g.us', id: 'msg-id', fromMe: false },
      message: { conversation: 'Hello' },
      messageTimestamp: 1700000000,
    };
    const result = parseIncomingMessage(1, raw as unknown as RawMsg);
    expect(result?.sender).toBe('unknown');
  });
});

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
    });
    await session.disconnect();
    expect(onStatusChange).toHaveBeenCalledWith('unlinked');
  });
});
