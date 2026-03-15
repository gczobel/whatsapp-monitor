import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Tests for the env schema logic without calling loadEnv() directly,
 * because loadEnv() calls process.exit() on validation failure.
 * We test the schema behaviour in isolation.
 */

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CONFIG_PATH: z.string().default('./config'),
  DATA_PATH: z.string().default('./data'),
  SESSIONS_PATH: z.string().default('./sessions'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

describe('env schema', () => {
  it('should return defaults when all fields are absent', () => {
    const result = envSchema.parse({});
    expect(result.PORT).toBe(3000);
    expect(result.CONFIG_PATH).toBe('./config');
    expect(result.DATA_PATH).toBe('./data');
    expect(result.SESSIONS_PATH).toBe('./sessions');
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('should coerce PORT from string to number', () => {
    const result = envSchema.parse({ PORT: '4000' });
    expect(result.PORT).toBe(4000);
  });

  it('should accept all valid LOG_LEVEL values', () => {
    const levels = ['debug', 'info', 'warn', 'error'] as const;
    for (const level of levels) {
      const result = envSchema.parse({ LOG_LEVEL: level });
      expect(result.LOG_LEVEL).toBe(level);
    }
  });

  it('should reject invalid LOG_LEVEL values', () => {
    expect(() => envSchema.parse({ LOG_LEVEL: 'verbose' })).toThrow();
  });

  it('should reject non-positive PORT values', () => {
    expect(() => envSchema.parse({ PORT: '-1' })).toThrow();
    expect(() => envSchema.parse({ PORT: '0' })).toThrow();
  });

  it('should accept custom paths', () => {
    const result = envSchema.parse({
      CONFIG_PATH: '/mnt/nas/config',
      DATA_PATH: '/mnt/nas/data',
      SESSIONS_PATH: '/mnt/nas/sessions',
    });
    expect(result.CONFIG_PATH).toBe('/mnt/nas/config');
    expect(result.DATA_PATH).toBe('/mnt/nas/data');
    expect(result.SESSIONS_PATH).toBe('/mnt/nas/sessions');
  });
});
