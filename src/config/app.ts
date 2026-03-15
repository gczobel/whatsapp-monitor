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
});

const scanProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  cron: z.string().min(1),
  enabled: z.boolean(),
});

const accountProfilesSchema = z.object({
  id: z.number().int().positive(),
  displayName: z.string().min(1),
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
  const raw = readFileSync(join(configPath, 'app.json'), 'utf-8');
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
