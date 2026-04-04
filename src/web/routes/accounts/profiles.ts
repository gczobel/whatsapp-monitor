import { Router } from 'express';
import type { AccountRoutesOptions } from './shared.js';
import { parseAccountId, toggleProfile } from './shared.js';
import { getAccount } from '../../../db/accounts.js';
import { renderLayout, renderPageHeader, renderError } from '../../layout.js';
import { escapeHtml, describeCron } from '../../../utils.js';

/** Renders the scan schedule + optional heartbeat schedule cron pickers for a form. */
function renderCronSection(): string {
  return `
    <div class="space-y-2">
      <label class="block text-sm font-medium text-slate-700">Scan schedule</label>
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

    <!-- Heartbeat schedule (optional) -->
    <div class="border-t border-slate-100 pt-4">
      <label class="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3 cursor-pointer">
        <input type="checkbox" x-model="heartbeatEnabled" class="rounded" />
        📡 Daily status ping (heartbeat)
      </label>
      <div x-show="heartbeatEnabled" class="space-y-2">
        <div class="flex flex-wrap gap-2">
          <select x-model="heartbeatPreset" @change="applyHeartbeatPreset()"
                  class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="custom">Custom cron</option>
            <option value="daily7">Daily at 07:00</option>
            <option value="daily8">Daily at 08:00</option>
            <option value="daily9">Daily at 09:00</option>
            <option value="daily18">Daily at 18:00</option>
          </select>
          <input type="text" x-model="heartbeatCron"
                 class="flex-1 min-w-[160px] border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                 placeholder="0 8 * * *" />
        </div>
        <p class="text-xs text-slate-400">Sends "bot alive" + scan stats to your Saved Messages on this schedule.</p>
      </div>
      <!-- Single hidden input submits the effective value: cron when enabled, empty when disabled -->
      <input type="hidden" name="heartbeatCron" :value="heartbeatEnabled ? heartbeatCron : ''" />
    </div>`;
}

export function createProfilesRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  const { profilesConfig } = options;

  router.get('/profiles', (req, res) => {
    const accountId = parseAccountId(req);
    const accountConfig = profilesConfig.accounts.find((a) => a.id === accountId);
    const profiles = accountConfig?.profiles ?? [];
    const account = getAccount(options.db, accountId);
    const groupName = account?.monitoredGroupName ?? null;

    const groupBanner = `
      <div class="flex items-center gap-2 mb-6 text-sm text-slate-600">
        <span>All profiles monitor:</span>
        ${
          groupName
            ? `<strong class="text-slate-900">${escapeHtml(groupName)}</strong>`
            : `<span class="text-amber-700 font-medium">No group selected</span>`
        }
        <a href="/accounts/${accountId}/group" class="ml-1 text-green-600 hover:underline">Change →</a>
      </div>`;

    const profileCards = profiles
      .map(
        (p, idx) => `
        <div class="bg-white rounded-lg border border-slate-200 p-5"
             x-data="profileCard('${escapeHtml(p.cron)}', ${p.heartbeatCron ? `'${escapeHtml(p.heartbeatCron)}'` : 'null'})">

          <!-- ── View mode ── -->
          <div x-show="!editing">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-slate-900">${escapeHtml(p.name)}</h3>
              <div class="flex items-center gap-2">
                <!-- Run Now -->
                <form method="POST" action="/accounts/${accountId}/profiles/${idx}/run"
                      class="flex items-center gap-1">
                  <select name="hours"
                          class="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="">Since last run</option>
                    <option value="3">Last 3h</option>
                    <option value="6">Last 6h</option>
                    <option value="12">Last 12h</option>
                    <option value="24">Last 24h</option>
                  </select>
                  <button type="submit"
                          class="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50 transition-colors">
                    ▶ Run
                  </button>
                </form>
                <!-- Edit -->
                <button type="button" @click="editing = true"
                        class="text-xs text-slate-600 border border-slate-300 rounded px-2 py-1 hover:bg-slate-50 transition-colors">
                  Edit
                </button>
                <!-- Enable / Disable -->
                ${
                  p.enabled
                    ? `<form method="POST" action="/accounts/${accountId}/profiles/${idx}/disable">
                         <button type="submit" class="text-xs text-slate-600 border border-slate-300 rounded px-2 py-1 hover:bg-slate-50">Disable</button>
                       </form>`
                    : `<form method="POST" action="/accounts/${accountId}/profiles/${idx}/enable">
                         <button type="submit" class="text-xs text-green-600 border border-green-300 rounded px-2 py-1 hover:bg-green-50">Enable</button>
                       </form>`
                }
                <!-- Delete -->
                <form method="POST" action="/accounts/${accountId}/profiles/${idx}/delete"
                      onsubmit="return confirm('Delete profile \\'${escapeHtml(p.name)}\\'?')">
                  <button type="submit" class="text-xs text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50">Delete</button>
                </form>
              </div>
            </div>
            <p class="text-xs text-slate-500 mb-1">
              <span title="${escapeHtml(p.cron)}">${escapeHtml(describeCron(p.cron))}</span>
              ${p.heartbeatCron ? `<span class="ml-2 text-slate-400">· 📡 ${escapeHtml(describeCron(p.heartbeatCron))}</span>` : ''}
            </p>
            <p class="text-sm text-slate-600 mt-2 line-clamp-2">${escapeHtml(p.prompt)}</p>
          </div>

          <!-- ── Edit mode ── -->
          <div x-show="editing" x-cloak>
            <h3 class="font-semibold text-slate-900 mb-4">Edit Profile</h3>
            <form method="POST" action="/accounts/${accountId}/profiles/${idx}/edit" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input type="text" name="name" required value="${escapeHtml(p.name)}"
                       class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Prompt</label>
                <textarea name="prompt" rows="4" required
                          class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent">${escapeHtml(p.prompt)}</textarea>
              </div>
              ${renderCronSection()}
              <div class="flex gap-2">
                <button type="submit"
                        class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors">
                  Save
                </button>
                <button type="button" @click="editing = false"
                        class="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>

        </div>`,
      )
      .join('\n');

    const content = `
      ${renderPageHeader('Scan Profiles', 'Define what the LLM should look for and when to run.')}
      ${groupBanner}

      ${profiles.length > 0 ? `<div class="space-y-4 mb-8">${profileCards}</div>` : '<p class="text-sm text-slate-500 mb-8">No profiles yet.</p>'}

      <div class="bg-white rounded-lg border border-slate-200 p-5">
        <h3 class="font-semibold text-slate-900 mb-4">Add Profile</h3>
        <form method="POST" action="/accounts/${accountId}/profiles" class="space-y-4"
              x-data="profileCard('*/10 * * * *', null)">
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
          ${renderCronSection()}
          <button type="submit"
                  class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors">
            Add Profile
          </button>
        </form>
      </div>

      <script>
        // Single Alpine.js component per card — owns editing state + both cron fields.
        function profileCard(initialCron, initialHeartbeatCron) {
          const presets = {
            every10: '*/10 * * * *',
            every30: '*/30 * * * *',
            hourly:  '0 * * * *',
            daily8:  '0 8 * * *',
            daily18: '0 18 * * *',
            weekly:  '0 8 * * 1',
          };
          const heartbeatPresets = {
            daily7:  '0 7 * * *',
            daily8:  '0 8 * * *',
            daily9:  '0 9 * * *',
            daily18: '0 18 * * *',
          };
          const matchPreset = (c, map) => {
            const found = Object.entries(map).find(([, v]) => v === c);
            return found ? found[0] : 'custom';
          };
          const initCron = initialCron ?? '*/10 * * * *';
          const initHb   = initialHeartbeatCron || '';
          return {
            editing: false,
            // Scan cron
            preset: matchPreset(initCron, presets),
            cron: initCron,
            presets: Object.assign({ custom: null }, presets),
            applyPreset() {
              const v = this.presets[this.preset];
              if (v) this.cron = v;
            },
            // Heartbeat cron
            heartbeatEnabled: initHb !== '',
            heartbeatPreset: matchPreset(initHb || '0 8 * * *', heartbeatPresets),
            heartbeatCron: initHb || '0 8 * * *',
            heartbeatPresets: Object.assign({ custom: null }, heartbeatPresets),
            applyHeartbeatPreset() {
              const v = this.heartbeatPresets[this.heartbeatPreset];
              if (v) this.heartbeatCron = v;
            },
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
    const { name, prompt, cron, heartbeatCron } = req.body as {
      name: string;
      prompt: string;
      cron: string;
      heartbeatCron?: string;
    };

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

    const entry: (typeof accountConfig.profiles)[number] = {
      id,
      name,
      prompt,
      cron,
      enabled: true,
    };
    if (typeof heartbeatCron === 'string' && heartbeatCron !== '') {
      entry.heartbeatCron = heartbeatCron;
    }
    accountConfig.profiles.push(entry);
    options.saveProfilesConfig();
    res.redirect(`/accounts/${accountId}/profiles`);
  });

  router.post('/profiles/:idx/edit', (req, res) => {
    const accountId = parseAccountId(req);
    const idx = Number((req.params as Record<string, string>)['idx']);
    const { name, prompt, cron, heartbeatCron } = req.body as {
      name: string;
      prompt: string;
      cron: string;
      heartbeatCron?: string;
    };

    if (typeof name !== 'string' || typeof prompt !== 'string' || typeof cron !== 'string') {
      res.status(400).send(renderError('Missing required fields'));
      return;
    }

    const accountConfig = profilesConfig.accounts.find((a) => a.id === accountId);
    const profile = accountConfig?.profiles[idx];
    if (!profile) {
      res.status(404).send(renderError('Profile not found'));
      return;
    }

    profile.name = name;
    profile.prompt = prompt;
    profile.cron = cron;
    if (typeof heartbeatCron === 'string' && heartbeatCron !== '') {
      profile.heartbeatCron = heartbeatCron;
    } else {
      delete profile.heartbeatCron;
    }
    options.saveProfilesConfig();
    res.redirect(`/accounts/${accountId}/profiles`);
  });

  router.post('/profiles/:idx/run', (req, res) => {
    const accountId = parseAccountId(req);
    const idx = Number((req.params as Record<string, string>)['idx']);
    const hoursStr = (req.body as Record<string, string | undefined>)['hours'];
    const hours = hoursStr ? Number(hoursStr) : null;
    const overrideSince = hours ? new Date(Date.now() - hours * 60 * 60 * 1000) : undefined;

    options.triggerProfile(idx, overrideSince).catch((error: unknown) => {
      console.error('[web/profiles] Run now failed:', error);
    });

    // Redirect immediately — the run happens asynchronously in the background.
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
    const idx = Number((req.params as Record<string, string>)['idx']);
    const accountConfig = profilesConfig.accounts.find((a) => a.id === accountId);
    if (accountConfig && idx >= 0 && idx < accountConfig.profiles.length) {
      accountConfig.profiles.splice(idx, 1);
      options.saveProfilesConfig();
    }
    res.redirect(`/accounts/${accountId}/profiles`);
  });

  return router;
}
