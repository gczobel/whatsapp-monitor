import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Schemas ────────────────────────────────────────────────────────────────

const llmConfigSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'ollama']),
  endpoint: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
});

const appConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  llm: llmConfigSchema,
  scanWindowDays: z.number().int().positive().default(14),
  skipEmptyDelivery: z.boolean().default(true),
});

const scanProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  cron: z.string().min(1),
  /** Optional: when set, the scheduler also fires a heartbeat status ping on this schedule. */
  heartbeatCron: z.string().optional(),
  enabled: z.boolean(),
});

const accountProfilesSchema = z.object({
  id: z.number().int().positive(),
  displayName: z.string().min(1),
  // International format without +, e.g. "972501234567". Used to deliver results to Saved Messages.
  phoneNumber: z.string().min(1),
  profiles: z.array(scanProfileSchema),
});

const profilesConfigSchema = z.object({
  accounts: z.array(accountProfilesSchema),
});

// ── Exported types ─────────────────────────────────────────────────────────

export type LLMConfig = z.infer<typeof llmConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type ScanProfileConfig = z.infer<typeof scanProfileSchema>;
export type AccountProfilesConfig = z.infer<typeof accountProfilesSchema>;
export type ProfilesConfig = z.infer<typeof profilesConfigSchema>;

// ── Loaders ────────────────────────────────────────────────────────────────

export function loadAppConfig(configPath: string): AppConfig {
  const filePath = join(configPath, 'app.json');
  console.info('[config] Loading app config from:', filePath);
  const raw = readFileSync(filePath, 'utf-8');
  const result = appConfigSchema.safeParse(JSON.parse(raw) as unknown);
  if (!result.success) {
    console.error('[config] Invalid app.json:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export function loadProfilesConfig(configPath: string): ProfilesConfig {
  const raw = readFileSync(join(configPath, 'profiles.json'), 'utf-8');
  const result = profilesConfigSchema.safeParse(JSON.parse(raw) as unknown);
  if (!result.success) {
    console.error('[config] Invalid profiles.json:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export function saveProfilesConfig(configPath: string, config: ProfilesConfig): void {
  writeFileSync(join(configPath, 'profiles.json'), JSON.stringify(config, null, 2), 'utf-8');
}

export function saveAppConfig(configPath: string, config: AppConfig): void {
  writeFileSync(join(configPath, 'app.json'), JSON.stringify(config, null, 2), 'utf-8');
}
