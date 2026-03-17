import { Router } from 'express';
import type { AccountRoutesOptions } from './shared.js';
import { parseAccountId } from './shared.js';
import { getScanResultsForProfile } from '../../../db/results.js';
import { getMessagesByIds } from '../../../db/messages.js';
import { renderLayout, renderPageHeader } from '../../layout.js';
import { escapeHtml, formatTimestamp } from '../../../utils.js';

export function createHistoryRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  const { db, profilesConfig } = options;

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
      .map((r) => {
        const sourceMessages = getMessagesByIds(db, r.inputMessageIds);
        const messagesHtml =
          sourceMessages.length === 0
            ? '<p class="text-slate-400 italic">Messages no longer in DB.</p>'
            : sourceMessages
                .map(
                  (m) =>
                    `<div><span class="text-slate-400">${escapeHtml(formatTimestamp(m.timestamp))}</span> <span class="font-semibold text-slate-700">${escapeHtml(m.sender)}</span>: <span class="text-slate-600 whitespace-pre-wrap">${escapeHtml(m.content)}</span></div>`,
                )
                .join('\n');
        return `
        <div class="bg-white rounded-lg border border-slate-200 p-5">
          <p class="text-xs text-slate-400 mb-2">${escapeHtml(formatTimestamp(r.timestamp))} · ${r.inputMessageIds.length} messages processed</p>
          <div class="text-sm text-slate-800 whitespace-pre-wrap">${escapeHtml(r.output)}</div>
          <details class="mt-3">
            <summary class="text-xs text-slate-500 cursor-pointer hover:text-slate-700 select-none">${r.inputMessageIds.length} source messages</summary>
            <div class="mt-2 space-y-1 text-xs font-mono bg-slate-50 rounded p-2 max-h-48 overflow-y-auto">${messagesHtml}</div>
          </details>
        </div>`;
      })
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
