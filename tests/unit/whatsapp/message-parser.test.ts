import { describe, it, expect } from 'vitest';
import { parseIncomingMessage } from '../../../src/whatsapp/message-parser.js';
import type { RawMsg } from '../../../src/whatsapp/message-parser.js';

function makeMsg(overrides: Partial<RawMsg> = {}): RawMsg {
  return {
    key: { remoteJid: '1234567890@g.us', id: 'msg-id', fromMe: false },
    message: { conversation: 'Hello group' },
    messageTimestamp: 1700000000,
    pushName: 'Yossi',
    ...overrides,
  } as unknown as RawMsg;
}

// Deep-merge helper so nested overrides (e.g. key.id) don't wipe sibling fields.
function makeMsgDeep(deep: Record<string, unknown>): RawMsg {
  const base = makeMsg();
  return {
    ...base,
    ...deep,
    key: { ...(base.key as object), ...((deep['key'] as object) ?? {}) },
  } as unknown as RawMsg;
}

describe('parseIncomingMessage', () => {
  it('should return a NewMessage for a valid group text message', () => {
    const result = parseIncomingMessage(1, makeMsg());
    expect(result).not.toBeNull();
    expect(result?.accountId).toBe(1);
    expect(result?.groupId).toBe('1234567890@g.us');
    expect(result?.messageId).toBe('msg-id');
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

  it('should prepend quoted context when message is a reply', () => {
    const msg = makeMsgDeep({
      message: {
        extendedTextMessage: {
          text: 'Totally agree!',
          contextInfo: {
            quotedMessage: { conversation: 'We should fix the elevator' },
            participant: '972501234567@s.whatsapp.net',
          },
        },
      },
    });
    const result = parseIncomingMessage(1, msg);
    expect(result?.content).toBe('> 972501234567: We should fix the elevator\nTotally agree!');
  });

  it('should not prepend quoted block when contextInfo has no quotedMessage', () => {
    const msg = makeMsgDeep({
      message: {
        extendedTextMessage: {
          text: 'Plain reply',
          contextInfo: { participant: '972501234567@s.whatsapp.net' },
        },
      },
    });
    const result = parseIncomingMessage(1, msg);
    expect(result?.content).toBe('Plain reply');
  });

  it('should use "unknown" as sender when pushName is absent', () => {
    const raw = {
      key: { remoteJid: '1234567890@g.us', id: 'msg-id', fromMe: false },
      message: { conversation: 'Hello' },
      messageTimestamp: 1700000000,
    };
    const result = parseIncomingMessage(1, raw as unknown as RawMsg);
    expect(result?.sender).toBe('unknown');
  });

  it('should use "unknown" as quotedSender when contextInfo participant is absent', () => {
    const msg = makeMsgDeep({
      message: {
        extendedTextMessage: {
          text: 'Reply',
          contextInfo: {
            quotedMessage: { conversation: 'Original' },
          },
        },
      },
    });
    const result = parseIncomingMessage(1, msg);
    expect(result?.content).toBe('> unknown: Original\nReply');
  });
});
