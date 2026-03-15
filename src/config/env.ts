import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CONFIG_PATH: z.string().default('./config'),
  DATA_PATH: z.string().default('./data'),
  SESSIONS_PATH: z.string().default('./sessions'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[config] Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  return result.data;
}
