import { escapeHtml } from '../utils.js';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface LayoutOptions {
  title: string;
  accountId: number;
  activePath: string;
  content: string;
}

function navItems(accountId: number): NavItem[] {
  const base = `/accounts/${accountId}`;
  return [
    { label: 'Dashboard', href: `${base}/`, icon: iconDashboard() },
    { label: 'Setup', href: `${base}/setup`, icon: iconSetup() },
    { label: 'Group', href: `${base}/group`, icon: iconGroup() },
    { label: 'Profiles', href: `${base}/profiles`, icon: iconProfiles() },
    { label: 'History', href: `${base}/history`, icon: iconHistory() },
  ];
}

export function renderLayout(options: LayoutOptions): string {
  const items = navItems(options.accountId);
  const navHtml = items
    .map((item) => {
      const isActive = options.activePath === item.href;
      const activeClass = isActive
        ? 'bg-green-700 text-white'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white';
      return `
        <a href="${escapeHtml(item.href)}"
           class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeClass}">
          ${item.icon}
          ${escapeHtml(item.label)}
        </a>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.title)} — WhatsApp Monitor</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"></script>
  <script src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    .htmx-indicator { opacity: 0; transition: opacity 200ms ease-in; }
    .htmx-request .htmx-indicator { opacity: 1; }
  </style>
</head>
<body class="h-full bg-slate-50" hx-boost="true">

  <div class="flex h-full">

    <!-- Sidebar -->
    <aside class="hidden md:flex md:flex-col w-60 bg-slate-900 shrink-0">
      <!-- Logo -->
      <div class="flex items-center gap-2 px-4 py-5 border-b border-slate-700">
        <span class="text-2xl">💬</span>
        <span class="text-white font-semibold text-sm leading-tight">WhatsApp<br>Monitor</span>
      </div>

      <!-- Nav -->
      <nav class="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        ${navHtml}
      </nav>

      <!-- Bottom: Config link -->
      <div class="px-2 py-4 border-t border-slate-700">
        <a href="/config"
           class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors ${options.activePath === '/config' ? 'bg-green-700 text-white' : ''}">
          ${iconConfig()}
          Config
        </a>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">

      <!-- Top bar (mobile) -->
      <header class="md:hidden flex items-center justify-between bg-slate-900 px-4 py-3">
        <span class="text-white font-semibold">💬 WhatsApp Monitor</span>
        <button onclick="document.getElementById('mobile-menu').classList.toggle('hidden')"
                class="text-slate-300 hover:text-white">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </header>

      <!-- Mobile menu -->
      <div id="mobile-menu" class="hidden md:hidden bg-slate-800 px-2 py-2 space-y-1">
        ${navHtml}
        <a href="/config" class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white">
          ${iconConfig()} Config
        </a>
      </div>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto p-6">
        ${options.content}
      </main>
    </div>

  </div>

</body>
</html>`;
}

export function renderError(message: string): string {
  return `<div class="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-sm">${escapeHtml(message)}</div>`;
}

export function renderPageHeader(title: string, subtitle?: string): string {
  return `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="mt-1 text-sm text-slate-500">${escapeHtml(subtitle)}</p>` : ''}
    </div>`;
}

// ── Icons (inline SVG, no external icon library dependency) ───────────────────

function iconDashboard(): string {
  return `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
  </svg>`;
}

function iconSetup(): string {
  return `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
  </svg>`;
}

function iconGroup(): string {
  return `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>`;
}

function iconProfiles(): string {
  return `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
  </svg>`;
}

function iconHistory(): string {
  return `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>`;
}

function iconConfig(): string {
  return `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>`;
}
