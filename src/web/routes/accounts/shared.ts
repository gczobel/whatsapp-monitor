import type { Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import type { WhatsAppSession } from '../../../whatsapp/session.js';
import type { ProfilesConfig } from '../../../config/app.js';
import { escapeHtml } from '../../../utils.js';

export interface AccountRoutesOptions {
  db: Database;
  session: WhatsAppSession;
  profilesConfig: ProfilesConfig;
  saveProfilesConfig: () => void;
  /** Immediately runs a profile by its index in the account's profiles array. */
  triggerProfile: (profileIdx: number) => Promise<void>;
  /** Called when the user selects a monitored group, so the scheduler can start. */
  onGroupSelected: () => void;
}

/**
 * Extracts accountId from the merged route params.
 * Using a type assertion here because Express's mergeParams does not propagate
 * parent route params through the generic type system.
 */
export function parseAccountId(req: Request): number {
  return Number((req.params as Record<string, string>)['accountId']);
}

export function renderStatusBadge(status: string): string {
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

export function toggleProfile(
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
