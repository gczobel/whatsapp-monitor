import { Router } from 'express';
import type { AccountRoutesOptions } from './shared.js';
import { parseAccountId, toggleProfile } from './shared.js';
import { renderLayout, renderPageHeader, renderError } from '../../layout.js';
import { escapeHtml } from '../../../utils.js';

export function createProfilesRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  const { profilesConfig } = options;

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

  return router;
}
