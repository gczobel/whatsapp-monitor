import type { WhatsAppSession } from '../whatsapp/session.js';
import type { ScanProfile } from '../types.js';
import { logPrefix } from '../utils.js';

/**
 * Delivers an LLM result to the user's own WhatsApp number (Saved Messages).
 *
 * Saved Messages is the user's own JID: <phone_number>@s.whatsapp.net
 * Sending to yourself shows the message in the "Saved Messages" / "Me" chat.
 */
export async function deliverResult(
  session: WhatsAppSession,
  phoneNumber: string,
  profile: ScanProfile,
  output: string,
): Promise<void> {
  const jid = `${phoneNumber}@s.whatsapp.net`;
  const text = formatDeliveryMessage(profile.name, output);

  try {
    await session.sendMessage(jid, text);
    console.info(
      logPrefix('delivery', 'INFO'),
      `Delivered result for profile "${profile.name}" to ${jid}`,
    );
  } catch (error) {
    console.error(
      logPrefix('delivery', 'ERROR'),
      `Failed to deliver result for profile "${profile.name}":`,
      error,
    );
    throw new Error(`Delivery failed for profile "${profile.name}": ${String(error)}`, {
      cause: error,
    });
  }
}

function formatDeliveryMessage(profileName: string, output: string): string {
  const timestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `📋 *${profileName}* — ${timestamp}\n\n${output}`;
}
