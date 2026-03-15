import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import type { WhatsAppSession } from '../../whatsapp/session.js';
import type { ScanProfile } from '../../types.js';
import type { ProfilesConfig } from '../../config/app.js';
import { getAccount, setMonitoredGroup } from '../../db/accounts.js';
import { getLastScanResult, getScanResultsForProfile } from '../../db/results.js';
import { renderLayout, renderPageHeader, renderError } from '../layout.js';
import { escapeHtml, formatTimestamp } from '../../utils.js';

export interface AccountRoutesOptions {
  db: Database;
  session: WhatsAppSession;
  profilesConfig: ProfilesConfig;
  saveProfilesConfig: () => void;
}

/**
 * Extracts accountId from the merged route params.
 * Using a type assertion here because Express's mergeParams does not propagate
 * parent route params through the generic type system.
 */
function parseAccountId(req: Request): number {
  return Number((req.params as Record<string, string>)['accountId']);
}

export function createAccountRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  const { db, session, profilesConfig } = options;

  // ── Dashboard ──────────────────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const accountId = parseAccountId(req);
    const account = getAccount(db, accountId);
    if (!account) {
      res.status(404).send(renderError(`Account ${accountId} not found`));
      return;
    }

    const accountProfiles = profilesConfig.accounts.find((a) => a.id === accountId)?.profiles ?? [];

    const profiles: ScanProfile[] = accountProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      prompt: p.prompt,
      cron: p.cron,
      isEnabled: p.enabled,
    }));

    const status = session.getStatus();
    const statusBadge = renderStatusBadge(status);

    const profileCards = profiles
      .map((p) => {
        const last = getLastScanResult(db, accountId, p.id);
        const lastRunText = last ? formatTimestamp(last.timestamp) : 'Never';
        const enabledBadge = p.isEnabled
          ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Enabled</span>'
          : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">Disabled</span>';
        return `
          <div class="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-900">${escapeHtml(p.name)}</span>
                ${enabledBadge}
              </div>
              <p class="text-xs text-slate-500 mt-1">Cron: <code class="font-mono bg-slate-50 px-1 rounded">${escapeHtml(p.cron)}</code> · Last run: ${escapeHtml(lastRunText)}</p>
            </div>
            <a href="/accounts/${accountId}/history?profile=${escapeHtml(p.id)}"
               class="text-sm text-green-600 hover:text-green-700 font-medium">View history →</a>
          </div>`;
      })
      .join('\n');

    const content = `
      ${renderPageHeader('Dashboard')}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div class="bg-white rounded-lg border border-slate-200 p-4">
          <p class="text-xs font-medium text-slate-500 uppercase tracking-wide">Session</p>
          <div class="mt-2">${statusBadge}</div>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 p-4">
          <p class="text-xs font-medium text-slate-500 uppercase tracking-wide">Monitored Group</p>
          <p class="mt-2 text-sm font-medium text-slate-900">
            ${account.monitoredGroupName ? escapeHtml(account.monitoredGroupName) : '<span class="text-slate-400 italic">None selected</span>'}
          </p>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 p-4">
          <p class="text-xs font-medium text-slate-500 uppercase tracking-wide">Active Profiles</p>
          <p class="mt-2 text-2xl font-bold text-slate-900">${profiles.filter((p) => p.isEnabled).length} <span class="text-sm font-normal text-slate-500">/ ${profiles.length}</span></p>
        </div>
      </div>

      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900">Scan Profiles</h2>
        <a href="/accounts/${accountId}/profiles"
           class="text-sm text-green-600 hover:text-green-700 font-medium">Manage →</a>
      </div>

      ${profiles.length === 0 ? '<p class="text-sm text-slate-500">No profiles yet. <a href="/accounts/' + accountId + '/profiles" class="text-green-600 underline">Create one</a>.</p>' : `<div class="space-y-3">${profileCards}</div>`}

      <div id="ws-alerts" class="mt-6"></div>`;

    res.send(
      renderLayout({
        title: 'Dashboard',
        accountId,
        activePath: `/accounts/${accountId}/`,
        content,
      }),
    );
  });

  // ── Setup (QR code / session) ──────────────────────────────────────────────

  router.get('/setup', (req, res) => {
    const accountId = parseAccountId(req);
    const status = session.getStatus();

    const content = `
      ${renderPageHeader('Setup', 'Link your WhatsApp account by scanning the QR code.')}

      <div class="bg-white rounded-lg border border-slate-200 p-6 max-w-md">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm font-medium text-slate-700">Session status</p>
          ${renderStatusBadge(status)}
        </div>

        ${
          status === 'linked'
            ? `<p class="text-sm text-slate-600 mb-4">Your account is linked and ready.</p>
               <form method="POST" action="/accounts/${accountId}/setup/logout">
                 <button type="submit"
                         class="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors">
                   Unlink account
                 </button>
               </form>`
            : `<p class="text-sm text-slate-600 mb-4">
                 Scan this QR code with your WhatsApp app: <strong>Settings → Linked Devices → Link a Device</strong>.
               </p>
               <div id="qr-container" class="flex items-center justify-center bg-slate-50 rounded-lg p-4 min-h-[220px]">
                 <canvas id="qr-canvas"></canvas>
                 <p id="qr-waiting" class="text-sm text-slate-400 animate-pulse">Waiting for QR code…</p>
               </div>
               <p class="text-xs text-slate-400 mt-3 text-center">
                 The QR code refreshes automatically. Keep this page open.
               </p>`
        }
      </div>

      <script>
        (function () {
          const ws = new WebSocket('ws://' + location.host + '/ws/${accountId}');
          const canvas = document.getElementById('qr-canvas');
          const waiting = document.getElementById('qr-waiting');

          ws.onmessage = function (event) {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'qr' && canvas) {
                waiting && (waiting.style.display = 'none');
                QRCode.toCanvas(canvas, msg.data, { width: 220, margin: 1 }, function (err) {
                  if (err) console.error('QR render error', err);
                });
              }
              if (msg.type === 'status' && msg.data === 'linked') {
                location.reload();
              }
            } catch (_) {}
          };
        })();
      </script>`;

    res.send(
      renderLayout({
        title: 'Setup',
        accountId,
        activePath: `/accounts/${accountId}/setup`,
        content,
      }),
    );
  });

  router.post('/setup/logout', async (req, res) => {
    const accountId = parseAccountId(req);
    try {
      await session.disconnect();
    } catch (error) {
      console.error('[web/accounts] Logout failed:', error);
    }
    res.redirect(`/accounts/${accountId}/setup`);
  });

  // ── Group selection ────────────────────────────────────────────────────────

  router.get('/group', async (req, res) => {
    const accountId = parseAccountId(req);
    const account = getAccount(db, accountId);

    if (session.getStatus() !== 'linked') {
      const content = `
        ${renderPageHeader('Group Selection')}
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
          You need to link your account first. <a href="/accounts/${accountId}/setup" class="underline font-medium">Go to Setup →</a>
        </div>`;
      res.send(
        renderLayout({
          title: 'Group',
          accountId,
          activePath: `/accounts/${accountId}/group`,
          content,
        }),
      );
      return;
    }

    let groups: Awaited<ReturnType<typeof session.listGroups>> = [];
    try {
      groups = await session.listGroups();
    } catch (error) {
      console.error('[web/accounts] Failed to list groups:', error);
    }

    groups.sort((a, b) => a.name.localeCompare(b.name));

    const currentGroupId = account?.monitoredGroupId ?? null;

    const groupRows = groups
      .map(
        (g) => `
        <tr class="hover:bg-slate-50">
          <td class="py-3 px-4 text-sm text-slate-900">${escapeHtml(g.name)}</td>
          <td class="py-3 px-4 text-sm text-slate-500 text-right">${g.participantCount} members</td>
          <td class="py-3 px-4 text-right">
            ${
              g.id === currentGroupId
                ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Monitoring</span>'
                : `<form method="POST" action="/accounts/${accountId}/group">
                     <input type="hidden" name="groupId" value="${escapeHtml(g.id)}" />
                     <input type="hidden" name="groupName" value="${escapeHtml(g.name)}" />
                     <button type="submit" class="text-xs text-green-600 hover:text-green-700 font-medium border border-green-300 rounded px-2 py-1 hover:bg-green-50 transition-colors">
                       Select
                     </button>
                   </form>`
            }
          </td>
        </tr>`,
      )
      .join('\n');

    const content = `
      ${renderPageHeader('Group Selection', `${groups.length} groups found. Select one to monitor.`)}
      <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50">
              <th class="py-3 px-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Group</th>
              <th class="py-3 px-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Members</th>
              <th class="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">${groupRows}</tbody>
        </table>
      </div>`;

    res.send(
      renderLayout({
        title: 'Group',
        accountId,
        activePath: `/accounts/${accountId}/group`,
        content,
      }),
    );
  });

  router.post('/group', (req, res) => {
    const accountId = parseAccountId(req);
    const { groupId, groupName } = req.body as { groupId: string; groupName: string };

    if (typeof groupId !== 'string' || typeof groupName !== 'string') {
      res.status(400).send(renderError('Missing groupId or groupName'));
      return;
    }

    setMonitoredGroup(db, accountId, groupId, groupName);
    res.redirect(`/accounts/${accountId}/`);
  });

  // ── Profiles ───────────────────────────────────────────────────────────────

  router.get('/profiles', (req, res) => {
    const accountId = parseAccountId(req);
    const accountConfig = profilesConfig.accounts.find((a) => a.id === accountId);
    const profiles = accountConfig?.profiles ?? [];

    const profileForms = profiles
      .map(
        (p, idx) => `
        <div class="bg-white rounded-lg border border-slate-200 p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-slate-900">${escapeHtml(p.name)}</h3>
            <div class="flex items-center gap-2">
              ${
                p.enabled
                  ? `<form method="POST" action="/accounts/${accountId}/profiles/${idx}/disable">
                       <button type="submit" class="text-xs text-slate-600 border border-slate-300 rounded px-2 py-1 hover:bg-slate-50">Disable</button>
                     </form>`
                  : `<form method="POST" action="/accounts/${accountId}/profiles/${idx}/enable">
                       <button type="submit" class="text-xs text-green-600 border border-green-300 rounded px-2 py-1 hover:bg-green-50">Enable</button>
                     </form>`
              }
              <form method="POST" action="/accounts/${accountId}/profiles/${idx}/delete"
                    onsubmit="return confirm('Delete profile \\'${escapeHtml(p.name)}\\'?')">
                <button type="submit" class="text-xs text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50">Delete</button>
              </form>
            </div>
          </div>
          <p class="text-xs text-slate-500 mb-1">Cron: <code class="font-mono bg-slate-50 px-1 rounded">${escapeHtml(p.cron)}</code></p>
          <p class="text-sm text-slate-600 mt-2 line-clamp-2">${escapeHtml(p.prompt)}</p>
        </div>`,
      )
      .join('\n');

    const content = `
      ${renderPageHeader('Scan Profiles', 'Define what the LLM should look for and when to run.')}

      ${profiles.length > 0 ? `<div class="space-y-4 mb-8">${profileForms}</div>` : '<p class="text-sm text-slate-500 mb-8">No profiles yet.</p>'}

      <div class="bg-white rounded-lg border border-slate-200 p-5">
        <h3 class="font-semibold text-slate-900 mb-4">Add Profile</h3>
        <form method="POST" action="/accounts/${accountId}/profiles" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input type="text" name="name" required placeholder="e.g. Urgent Scan"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Prompt</label>
            <textarea name="prompt" rows="4" required
                      placeholder="Describe what the LLM should do with the messages…"
                      class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"></textarea>
          </div>
          <div x-data="cronBuilder()" class="space-y-2">
            <label class="block text-sm font-medium text-slate-700">Schedule</label>
            <div class="flex flex-wrap gap-2">
              <select x-model="preset" @change="applyPreset()"
                      class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="custom">Custom cron</option>
                <option value="every10">Every 10 minutes</option>
                <option value="every30">Every 30 minutes</option>
                <option value="hourly">Hourly</option>
                <option value="daily8">Daily at 08:00</option>
                <option value="daily18">Daily at 18:00</option>
                <option value="weekly">Weekly (Monday 08:00)</option>
              </select>
              <input type="text" name="cron" x-model="cron" required
                     class="flex-1 min-w-[160px] border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                     placeholder="*/10 * * * *" />
            </div>
            <p class="text-xs text-slate-400">Standard 5-field cron expression (minute hour day month weekday)</p>
          </div>
          <button type="submit"
                  class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors">
            Add Profile
          </button>
        </form>
      </div>

      <script>
        function cronBuilder() {
          return {
            preset: 'custom',
            cron: '*/10 * * * *',
            presets: {
              custom:   null,
              every10:  '*/10 * * * *',
              every30:  '*/30 * * * *',
              hourly:   '0 * * * *',
              daily8:   '0 8 * * *',
              daily18:  '0 18 * * *',
              weekly:   '0 8 * * 1',
            },
            applyPreset() {
              const v = this.presets[this.preset];
              if (v) this.cron = v;
            }
          };
        }
      </script>`;

    res.send(
      renderLayout({
        title: 'Profiles',
        accountId,
        activePath: `/accounts/${accountId}/profiles`,
        content,
      }),
    );
  });

  router.post('/profiles', (req, res) => {
    const accountId = parseAccountId(req);
    const { name, prompt, cron } = req.body as { name: string; prompt: string; cron: string };

    if (typeof name !== 'string' || typeof prompt !== 'string' || typeof cron !== 'string') {
      res.status(400).send(renderError('Missing required fields'));
      return;
    }

    const id = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const accountConfig = profilesConfig.accounts.find((a) => a.id === accountId);
    if (!accountConfig) {
      res.status(404).send(renderError(`Account ${accountId} not found in profiles config`));
      return;
    }

    accountConfig.profiles.push({ id, name, prompt, cron, enabled: true });
    options.saveProfilesConfig();
    res.redirect(`/accounts/${accountId}/profiles`);
  });

  router.post('/profiles/:idx/enable', (req, res) => {
    toggleProfile(req, res, options, true);
  });

  router.post('/profiles/:idx/disable', (req, res) => {
    toggleProfile(req, res, options, false);
  });

  router.post('/profiles/:idx/delete', (req, res) => {
    const accountId = parseAccountId(req);
    const idx = Number(req.params['idx']);
    const accountConfig = profilesConfig.accounts.find((a) => a.id === accountId);
    if (accountConfig && idx >= 0 && idx < accountConfig.profiles.length) {
      accountConfig.profiles.splice(idx, 1);
      options.saveProfilesConfig();
    }
    res.redirect(`/accounts/${accountId}/profiles`);
  });

  // ── History ────────────────────────────────────────────────────────────────

  router.get('/history', (req, res) => {
    const accountId = parseAccountId(req);
    const profileId = typeof req.query['profile'] === 'string' ? req.query['profile'] : null;

    const accountConfig = profilesConfig.accounts.find((a) => a.id === accountId);
    const profiles = accountConfig?.profiles ?? [];

    const activeProfileId = profileId ?? profiles[0]?.id ?? null;

    const profileTabs = profiles
      .map((p) => {
        const isActive = p.id === activeProfileId;
        return `<a href="?profile=${escapeHtml(p.id)}"
                    class="px-4 py-2 text-sm font-medium border-b-2 transition-colors ${isActive ? 'border-green-500 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}">
                  ${escapeHtml(p.name)}
                </a>`;
      })
      .join('\n');

    const results =
      activeProfileId !== null ? getScanResultsForProfile(db, accountId, activeProfileId, 20) : [];

    const resultCards = results
      .map(
        (r) => `
        <div class="bg-white rounded-lg border border-slate-200 p-5">
          <p class="text-xs text-slate-400 mb-2">${escapeHtml(formatTimestamp(r.timestamp))} · ${r.inputMessageIds.length} messages processed</p>
          <div class="text-sm text-slate-800 whitespace-pre-wrap">${escapeHtml(r.output)}</div>
        </div>`,
      )
      .join('\n');

    const content = `
      ${renderPageHeader('History', 'LLM output for each profile run.')}

      <div class="flex gap-1 border-b border-slate-200 mb-6">${profileTabs}</div>

      ${results.length === 0 ? '<p class="text-sm text-slate-500">No results yet for this profile.</p>' : `<div class="space-y-4">${resultCards}</div>`}`;

    res.send(
      renderLayout({
        title: 'History',
        accountId,
        activePath: `/accounts/${accountId}/history`,
        content,
      }),
    );
  });

  return router;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderStatusBadge(status: string): string {
  const styles: Record<string, string> = {
    linked: 'bg-green-100 text-green-800',
    unlinked: 'bg-slate-100 text-slate-700',
    expired: 'bg-amber-100 text-amber-800',
    connecting: 'bg-blue-100 text-blue-800',
  };
  const style = styles[status] ?? 'bg-slate-100 text-slate-700';
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style}">
    <span class="w-1.5 h-1.5 rounded-full ${status === 'linked' ? 'bg-green-500' : status === 'connecting' ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}"></span>
    ${escapeHtml(status)}
  </span>`;
}

function toggleProfile(
  req: Request,
  res: Response,
  options: AccountRoutesOptions,
  isEnabled: boolean,
): void {
  const accountId = parseAccountId(req);
  const idx = Number((req.params as Record<string, string>)['idx']);
  const accountConfig = options.profilesConfig.accounts.find((a) => a.id === accountId);
  const profile = accountConfig?.profiles[idx];
  if (profile !== undefined) {
    profile.enabled = isEnabled;
    options.saveProfilesConfig();
  }
  res.redirect(`/accounts/${accountId}/profiles`);
}
