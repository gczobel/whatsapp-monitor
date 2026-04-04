/**
 * Shared domain types used across all modules.
 * This file has no imports from any domain module — it is safe for everyone to import.
 */

export interface Account {
  id: number;
  displayName: string;
  phoneNumber: string;
  monitoredGroupId: string | null;
  monitoredGroupName: string | null;
}

export interface NewMessage {
  accountId: number;
  groupId: string;
  messageId: string;
  timestamp: Date;
  sender: string;
  content: string;
}

export interface Message extends NewMessage {
  id: number;
  processedBy: string | null;
}

export interface ScanProfile {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  /** Optional schedule for a daily status ping. When set, the scheduler fires a heartbeat on this cron in addition to the scan. */
  heartbeatCron?: string;
  isEnabled: boolean;
}

export interface NewScanResult {
  accountId: number;
  profileId: string;
  timestamp: Date;
  inputMessageIds: number[];
  previousSummary: string | null;
  output: string;
}

export interface ScanResult extends NewScanResult {
  id: number;
}

export interface WhatsAppGroup {
  id: string;
  name: string;
  participantCount: number;
}

export type SessionStatus = 'linked' | 'unlinked' | 'connecting';
