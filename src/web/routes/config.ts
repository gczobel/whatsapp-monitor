import { Router } from 'express';
import type { AppConfig } from '../../config/app.js';
import { renderLayout, renderPageHeader } from '../layout.js';
import { escapeHtml } from '../../utils.js';

export interface ConfigRoutesOptions {
  appConfig: AppConfig;
  saveAppConfig: (config: AppConfig) => void;
}

export function createConfigRouter(options: ConfigRoutesOptions): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const { appConfig } = options;

    const providers = ['gemini', 'openai', 'ollama'] as const;
    const providerOptions = providers
      .map(
        (p) =>
          `<option value="${p}" ${appConfig.llm.provider === p ? 'selected' : ''}>${p}</option>`,
      )
      .join('');

    const content = `
      ${renderPageHeader('Configuration', 'Global settings for the LLM provider.')}

      <div class="bg-white rounded-lg border border-slate-200 p-6 max-w-lg">
        <form method="POST" action="/config" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">LLM Provider</label>
            <select name="provider" id="provider-select"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              ${providerOptions}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Endpoint URL</label>
            <input type="url" name="endpoint" required
                   value="${escapeHtml(appConfig.llm.endpoint)}"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                   placeholder="https://generativelanguage.googleapis.com/v1beta" />
            <p class="text-xs text-slate-400 mt-1">
              Gemini: <code>https://generativelanguage.googleapis.com/v1beta</code><br>
              OpenAI: <code>https://api.openai.com/v1</code><br>
              Ollama: <code>http://localhost:11434</code>
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">
              API Key <span class="text-slate-400 font-normal">(leave blank for Ollama)</span>
            </label>
            <input type="password" name="apiKey"
                   value="${escapeHtml(appConfig.llm.apiKey ?? '')}"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                   placeholder="sk-…" />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Model</label>
            <input type="text" name="model" required
                   value="${escapeHtml(appConfig.llm.model)}"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                   placeholder="gemini-2.0-flash" />
          </div>

          <div class="pt-2">
            <button type="submit"
                    class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors">
              Save Configuration
            </button>
          </div>
        </form>
      </div>`;

    res.send(
      renderLayout({
        title: 'Configuration',
        accountId: 1,
        activePath: '/config',
        content,
      }),
    );
  });

  router.post('/', (req, res) => {
    const body = req.body as Record<string, string>;

    const provider = body['provider'];
    const endpoint = body['endpoint'];
    const apiKey = body['apiKey'];
    const model = body['model'];

    if (provider !== 'gemini' && provider !== 'openai' && provider !== 'ollama') {
      res.status(400).send('Invalid provider');
      return;
    }

    const updated: AppConfig = {
      ...options.appConfig,
      llm: {
        provider,
        endpoint: endpoint ?? options.appConfig.llm.endpoint,
        model: model ?? options.appConfig.llm.model,
        ...(apiKey ? { apiKey } : {}),
      },
    };

    options.saveAppConfig(updated);
    res.redirect('/config');
  });

  return router;
}
