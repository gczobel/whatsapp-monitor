import type { BaileysEventMap } from '@whiskeysockets/baileys';
import type { NewMessage } from '../types.js';

export type RawMsg = BaileysEventMap['messages.upsert']['messages'][number];

/**
 * Parses a raw Baileys message into a NewMessage, or returns null if the
 * message should be ignored (non-group, non-text, etc.).
 * Exported as a pure function so it can be unit-tested without Baileys.
 */
export function parseIncomingMessage(accountId: number, msg: RawMsg): NewMessage | null {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid?.endsWith('@g.us')) return null;

  let content = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
  if (!content) return null;

  // Inline quoted context so the LLM understands reply chains.
  // Baileys delivers quoted messages via extendedTextMessage.contextInfo on replies.
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (contextInfo?.quotedMessage) {
    const quotedText =
      contextInfo.quotedMessage.conversation ?? contextInfo.quotedMessage.extendedTextMessage?.text;
    if (quotedText) {
      // Strip the @s.whatsapp.net / @g.us suffix to get a readable sender identifier.
      const quotedSender = contextInfo.participant?.replace(/@.*$/, '') ?? 'unknown';
      content = `> ${quotedSender}: ${quotedText}\n${content}`;
    }
  }

  // messageTimestamp can be a plain number or a protobuf Long object (history sync).
  // Number() handles both; Long has .valueOf() that Number() uses.
  const ts = Number(msg.messageTimestamp);
  const timestamp = ts > 0 ? new Date(ts * 1000) : new Date();

  return {
    accountId,
    groupId: remoteJid,
    messageId: msg.key.id ?? '',
    timestamp,
    sender: msg.pushName ?? 'unknown',
    content,
  };
}
