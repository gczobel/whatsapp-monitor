import { Router } from 'express';
import type { ScanProfile } from '../../../types.js';
import type { AccountRoutesOptions } from './shared.js';
import { parseAccountId, renderStatusBadge } from './shared.js';
import { getAccount } from '../../../db/accounts.js';
import { getLastScanResult } from '../../../db/results.js';
import { renderLayout, renderPageHeader, renderError } from '../../layout.js';
import { escapeHtml, formatTimestamp } from '../../../utils.js';

export function createDashboardRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  const { db, session, profilesConfig } = options;

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

  return router;
}
