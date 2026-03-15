import { loadEnv } from './config/env.js';
import { loadAppConfig, loadProfilesConfig } from './config/app.js';
import { openDatabase } from './db/index.js';
import { upsertAccount } from './db/accounts.js';
import { createLLMClient } from './llm/factory.js';
import { WhatsAppSession } from './whatsapp/session.js';
import { startScheduler } from './scheduler/index.js';
import { deliverResult } from './delivery/sender.js';
import { createWebServer } from './web/server.js';
import { logPrefix } from './utils.js';
import type { ScanProfile } from './types.js';

async function main(): Promise<void> {
  // ── 1. Load configuration ──────────────────────────────────────────────────
  const env = loadEnv();
  const appConfig = loadAppConfig(env.CONFIG_PATH);
  const profilesConfig = loadProfilesConfig(env.CONFIG_PATH);

  // ── 2. Open database ───────────────────────────────────────────────────────
  const db = openDatabase(env.DATA_PATH);
  console.info(logPrefix('index', 'INFO'), 'Database ready');

  // ── 3. Bootstrap account records from profiles config ──────────────────────
  // profiles.json is the source of truth for which accounts exist.
  // Sync them into SQLite so the rest of the app can join against accounts.
  for (const accountConfig of profilesConfig.accounts) {
    upsertAccount(db, {
      id: accountConfig.id,
      displayName: accountConfig.displayName,
      phoneNumber: '',
    });
  }

  // For now: single account (F7.5). Multi-account (FR1) is handled by the
  // account-scoped architecture — no code changes needed here to extend it.
  const primaryAccount = profilesConfig.accounts[0];
  if (!primaryAccount) {
    console.error(logPrefix('index', 'ERROR'), 'No accounts defined in profiles.json. Exiting.');
    process.exit(1);
  }

  // ── 4. Create LLM client ───────────────────────────────────────────────────
  const llm = createLLMClient(appConfig.llm);
  console.info(
    logPrefix('index', 'INFO'),
    `LLM provider: ${appConfig.llm.provider} / ${appConfig.llm.model}`,
  );

  // ── 5. Create WhatsApp session ─────────────────────────────────────────────
  // The session is created before the web server so it can be injected into it.
  // We use a deferred broadcast function so the session callbacks can reference
  // the web server without a forward-reference issue.
  let broadcast: (accountId: number, type: 'qr' | 'status' | 'alert', data: string) => void = () =>
    undefined;

  let stopScheduler: (() => void) | null = null;

  const session = new WhatsAppSession(primaryAccount.id, env.SESSIONS_PATH, db, {
    onQRCode: (qr): void => {
      broadcast(primaryAccount.id, 'qr', qr);
    },
    onStatusChange: (status): void => {
      broadcast(primaryAccount.id, 'status', status);

      if (status === 'linked') {
        const groupId =
          db
            .prepare<
              [number],
              { monitored_group_id: string | null }
            >('SELECT monitored_group_id FROM accounts WHERE id = ?')
            .get(primaryAccount.id)?.monitored_group_id ?? null;

        if (groupId === null) {
          console.warn(
            logPrefix('index', 'WARN'),
            'No group selected — scheduler will not start until a group is chosen.',
          );
          return;
        }

        const profiles: ScanProfile[] = (
          profilesConfig.accounts.find((a) => a.id === primaryAccount.id)?.profiles ?? []
        )
          .filter((p) => p.enabled)
          .map((p) => ({
            id: p.id,
            name: p.name,
            prompt: p.prompt,
            cron: p.cron,
            isEnabled: p.enabled,
          }));

        stopScheduler = startScheduler(profiles, {
          db,
          llm,
          accountId: primaryAccount.id,
          groupId,
          onResult: (output, profileId): void => {
            const profile = profiles.find((p) => p.id === profileId);
            if (!profile) return;

            broadcast(primaryAccount.id, 'alert', output);

            deliverResult(session, primaryAccount.displayName, profile, output).catch(
              (error: unknown) => {
                console.error(logPrefix('index', 'ERROR'), 'Delivery error:', error);
              },
            );
          },
        });
      }

      if (status === 'unlinked' && stopScheduler !== null) {
        stopScheduler();
        stopScheduler = null;
      }
    },
    onMessage: (): void => {
      // Messages are persisted in WhatsAppSession.handleIncomingMessage.
      // Real-time dashboard push can be added here later.
    },
  });

  // ── 6. Create and start web server ─────────────────────────────────────────
  const webServer = createWebServer({
    port: env.PORT,
    configPath: env.CONFIG_PATH,
    db,
    session,
    appConfig,
    profilesConfig,
  });

  // Wire the broadcast function now that webServer exists.
  broadcast = (accountId, type, data): void =>
    webServer.broadcastToAccount(accountId, { type, data });

  webServer.start();

  // ── 7. Connect WhatsApp session ────────────────────────────────────────────
  await session.connect();
}

main().catch((error: unknown) => {
  console.error(logPrefix('index', 'ERROR'), 'Fatal startup error:', error);
  process.exit(1);
});
