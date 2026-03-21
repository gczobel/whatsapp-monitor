import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Database } from 'better-sqlite3';
import type { WhatsAppSession } from '../whatsapp/session.js';
import type { AppConfig, ProfilesConfig } from '../config/app.js';
import { createAccountRouter } from './routes/accounts/index.js';
import { createConfigRouter } from './routes/config.js';
import { saveAppConfig, saveProfilesConfig } from '../config/app.js';
import { logPrefix } from '../utils.js';

export interface ServerOptions {
  port: number;
  configPath: string;
  db: Database;
  session: WhatsAppSession;
  appConfig: AppConfig;
  profilesConfig: ProfilesConfig;
  triggerProfile: (profileIdx: number, overrideSince?: Date) => Promise<void>;
  /** Called when the user selects a monitored group, so the scheduler can start. */
  onGroupSelected: () => void;
  /** Last delivery error message per profile ID. Cleared on successful delivery. */
  deliveryErrors: ReadonlyMap<string, string>;
}

export interface WebServer {
  start(): void;
  broadcastToAccount(accountId: number, message: WsMessage): void;
}

export interface WsMessage {
  type: 'qr' | 'status' | 'alert';
  data: string;
}

export function createWebServer(options: ServerOptions): WebServer {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // Track open WebSocket connections per account for targeted broadcasts.
  const clientsByAccount = new Map<number, Set<WebSocket>>();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Serve static assets (if any custom CSS/JS beyond CDN).
  app.use('/public', express.static(new URL('./public', import.meta.url).pathname));

  // Redirect root to the default account dashboard (F7.5: single account today).
  app.get('/', (_req, res) => res.redirect('/accounts/1/'));

  // Account-scoped routes.
  app.use(
    '/accounts/:accountId',
    createAccountRouter({
      db: options.db,
      session: options.session,
      profilesConfig: options.profilesConfig,
      saveProfilesConfig: () => saveProfilesConfig(options.configPath, options.profilesConfig),
      triggerProfile: options.triggerProfile,
      onGroupSelected: options.onGroupSelected,
      deliveryErrors: options.deliveryErrors,
    }),
  );

  // Global config routes.
  app.use(
    '/config',
    createConfigRouter({
      appConfig: options.appConfig,
      saveAppConfig: (updated) => {
        options.appConfig = updated;
        saveAppConfig(options.configPath, updated);
      },
    }),
  );

  // WebSocket — one connection per browser tab, scoped to an account.
  wss.on('connection', (ws, req) => {
    const match = /\/ws\/(\d+)/.exec(req.url ?? '');
    const accountId = match ? Number(match[1]) : null;

    if (accountId === null) {
      ws.close();
      return;
    }

    if (!clientsByAccount.has(accountId)) {
      clientsByAccount.set(accountId, new Set());
    }
    clientsByAccount.get(accountId)!.add(ws);
    const clientCount = clientsByAccount.get(accountId)!.size;
    console.info(
      logPrefix('web', 'INFO'),
      `WS client connected — account ${accountId}, total clients: ${clientCount}`,
    );

    // Replay current state so late-connecting clients (e.g. page load after QR
    // was already broadcast) don't get stuck waiting for the next event.
    const currentStatus = options.session.getStatus();
    ws.send(JSON.stringify({ type: 'status', data: currentStatus }));
    console.info(logPrefix('web', 'INFO'), `WS replay — status: ${currentStatus}`);

    const pendingQR = options.session.getLastQR();
    if (pendingQR !== null) {
      ws.send(JSON.stringify({ type: 'qr', data: pendingQR }));
      console.info(logPrefix('web', 'INFO'), `WS replay — QR sent (${pendingQR.length} chars)`);
    } else {
      console.info(logPrefix('web', 'INFO'), 'WS replay — no QR cached yet');
    }

    ws.on('close', () => {
      clientsByAccount.get(accountId)?.delete(ws);
      console.info(logPrefix('web', 'INFO'), `WS client disconnected — account ${accountId}`);
    });
  });

  function broadcastToAccount(accountId: number, message: WsMessage): void {
    const clients = clientsByAccount.get(accountId);
    if (!clients || clients.size === 0) {
      console.info(
        logPrefix('web', 'INFO'),
        `broadcast ${message.type} — no WS clients connected for account ${accountId}`,
      );
      return;
    }
    const payload = JSON.stringify(message);
    let sent = 0;
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
        sent++;
      }
    }
    console.info(
      logPrefix('web', 'INFO'),
      `broadcast ${message.type} — sent to ${sent}/${clients.size} clients`,
    );
  }

  function start(): void {
    httpServer.listen(options.port, () => {
      console.info(
        logPrefix('web', 'INFO'),
        `WhatsApp Monitor running → http://localhost:${options.port}`,
      );
    });
  }

  return { start, broadcastToAccount };
}
