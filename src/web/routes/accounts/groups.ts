import { Router } from 'express';
import type { AccountRoutesOptions } from './shared.js';
import { parseAccountId } from './shared.js';
import { getAccount, setMonitoredGroup } from '../../../db/accounts.js';
import { renderLayout, renderPageHeader, renderError } from '../../layout.js';
import { escapeHtml } from '../../../utils.js';

export function createGroupsRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  const { db, session } = options;

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
    options.onGroupSelected();
    res.redirect(`/accounts/${accountId}/`);
  });

  return router;
}
