import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { loadEnv } from '../../../src/config/env.js';

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

describe('loadEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return parsed env with defaults when no vars are set', () => {
    delete process.env['PORT'];
    delete process.env['CONFIG_PATH'];
    delete process.env['DATA_PATH'];
    delete process.env['SESSIONS_PATH'];
    delete process.env['LOG_LEVEL'];
    const env = loadEnv();
    expect(env.PORT).toBe(3000);
    expect(env.CONFIG_PATH).toBe('./config');
  });

  it('should pick up PORT from process.env', () => {
    process.env['PORT'] = '4321';
    const env = loadEnv();
    expect(env.PORT).toBe(4321);
  });

  it('should call process.exit(1) when LOG_LEVEL is invalid', () => {
    process.env['LOG_LEVEL'] = 'verbose';
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    expect(() => loadEnv()).toThrow('process.exit called');
  });
});
