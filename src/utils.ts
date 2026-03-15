/**
 * Shared utilities with no imports from any domain module.
 */

/**
 * Escapes characters that have special meaning in HTML to prevent XSS.
 * Use this whenever embedding user-supplied or external data into HTML strings.
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a Date as a human-readable local string for display in the UI.
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Returns a structured log prefix: [ISO timestamp] [module] [LEVEL]
 */
export function logPrefix(module: string, level: 'INFO' | 'WARN' | 'ERROR'): string {
  return `[${new Date().toISOString()}] [${module}] [${level}]`;
}
