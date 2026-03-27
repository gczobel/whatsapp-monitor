import type { WhatsAppSession } from '../whatsapp/session.js';
import type { ScanProfile } from '../types.js';
import { logPrefix } from '../utils.js';

/**
 * Delivers an LLM result to the user's own WhatsApp number (Saved Messages).
 *
 * Saved Messages is the user's own JID: <phone_number>@s.whatsapp.net
 * Sending to yourself shows the message in the "Saved Messages" / "Me" chat.
 *
 * On first failure, forces a session reconnect and retries once. This recovers
 * from broken Signal encryption sessions without requiring a manual restart.
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
  } catch (firstError) {
    console.warn(
      logPrefix('delivery', 'WARN'),
      `Delivery failed for profile "${profile.name}", waiting for session and retrying:`,
      firstError,
    );
    try {
      const linked = await session.waitForLinked(30_000);
      if (!linked)
        throw new Error('Session did not become linked within 30s', { cause: firstError });
      await session.sendMessage(jid, text);
      console.info(
        logPrefix('delivery', 'INFO'),
        `Delivered result for profile "${profile.name}" to ${jid} (after reconnect)`,
      );
    } catch (retryError) {
      console.error(
        logPrefix('delivery', 'ERROR'),
        `Delivery retry failed for profile "${profile.name}":`,
        retryError,
      );
      throw new Error(`Delivery failed for profile "${profile.name}": ${String(retryError)}`, {
        cause: retryError,
      });
    }
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
