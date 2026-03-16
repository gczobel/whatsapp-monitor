import { Router } from 'express';
import type { AccountRoutesOptions } from './shared.js';
import { parseAccountId, renderStatusBadge } from './shared.js';
import { renderLayout, renderPageHeader } from '../../layout.js';

export function createSetupRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  const { session } = options;

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
                 <img id="qr-image" src="" alt="WhatsApp QR code" style="display:none" width="220" height="220" />
                 <p id="qr-waiting" class="text-sm text-slate-400 animate-pulse">Waiting for QR code…</p>
               </div>
               <p class="text-xs text-slate-400 mt-3 text-center">
                 The QR code refreshes automatically. Keep this page open.
               </p>
               <script>
                 (function () {
                   const ws = new WebSocket('ws://' + location.host + '/ws/${accountId}');

                   // Close when HTMX swaps the page away so we don't accumulate stale connections.
                   document.addEventListener('htmx:beforeSwap', function () { ws.close(); }, { once: true });

                   ws.onmessage = function (event) {
                     try {
                       const msg = JSON.parse(event.data);
                       if (msg.type === 'qr') {
                         const img = document.getElementById('qr-image');
                         const waiting = document.getElementById('qr-waiting');
                         if (img) { img.src = msg.data; img.style.display = 'block'; }
                         if (waiting) waiting.style.display = 'none';
                       }
                       if (msg.type === 'status' && msg.data === 'linked') {
                         ws.close();
                         // Fetch the updated page via HTMX instead of location.reload().
                         // reload() races against transient non-linked status windows and loops;
                         // htmx.ajax returns the linked UI (no script) so the loop cannot restart.
                         htmx.ajax('GET', location.href, { target: 'body', swap: 'outerHTML' });
                       }
                     } catch (err) {
                       console.error('[WA monitor] WS error:', err);
                     }
                   };
                 })();
               </script>`
        }
      </div>`;

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

  return router;
}
