import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadAppConfig,
  loadProfilesConfig,
  saveAppConfig,
  saveProfilesConfig,
} from '../../../src/config/app.js';

// Mock node:fs so tests never touch the real filesystem
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

const validAppJson = JSON.stringify({
  llm: {
    provider: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'test-key',
    model: 'gemini-pro',
  },
});

const validProfilesJson = JSON.stringify({
  accounts: [
    {
      id: 1,
      displayName: 'Test User',
      phoneNumber: '972501234567',
      profiles: [
        {
          id: 'daily',
          name: 'Daily Summary',
          prompt: 'Summarize the messages.',
          cron: '0 9 * * *',
          enabled: true,
        },
      ],
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
  });
});

describe('loadAppConfig', () => {
  it('should parse a valid app.json', () => {
    mockReadFileSync.mockReturnValue(validAppJson);
    const config = loadAppConfig('/config');
    expect(config.llm.provider).toBe('gemini');
    expect(config.llm.model).toBe('gemini-pro');
    expect(config.port).toBe(3000); // default
  });

  it('should respect an explicit port in app.json', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        port: 8080,
        llm: {
          provider: 'openai',
          endpoint: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4',
        },
      }),
    );
    const config = loadAppConfig('/config');
    expect(config.port).toBe(8080);
  });

  it('should call process.exit(1) on invalid app.json', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ llm: {} }));
    expect(() => loadAppConfig('/config')).toThrow('process.exit called');
  });

  it('should reject an unknown LLM provider', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        llm: { provider: 'unknown', endpoint: 'http://x.com', model: 'x' },
      }),
    );
    expect(() => loadAppConfig('/config')).toThrow('process.exit called');
  });
});

describe('loadProfilesConfig', () => {
  it('should parse a valid profiles.json', () => {
    mockReadFileSync.mockReturnValue(validProfilesJson);
    const config = loadProfilesConfig('/config');
    expect(config.accounts).toHaveLength(1);
    expect(config.accounts[0]?.displayName).toBe('Test User');
    expect(config.accounts[0]?.profiles).toHaveLength(1);
  });

  it('should call process.exit(1) on invalid profiles.json', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ accounts: 'bad' }));
    expect(() => loadProfilesConfig('/config')).toThrow('process.exit called');
  });

  it('should reject a profile with missing required fields', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        accounts: [
          { id: 1, displayName: 'X', phoneNumber: '972501234567', profiles: [{ id: 'p1' }] },
        ],
      }),
    );
    expect(() => loadProfilesConfig('/config')).toThrow('process.exit called');
  });
});

describe('saveAppConfig', () => {
  it('should write serialised config to app.json', () => {
    const config = {
      port: 3000,
      llm: {
        provider: 'gemini' as const,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'key',
        model: 'gemini-pro',
      },
    };
    saveAppConfig('/config', config);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const [path, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(path).toContain('app.json');
    expect(JSON.parse(content)).toMatchObject({ port: 3000 });
  });
});

describe('saveProfilesConfig', () => {
  it('should write serialised profiles to profiles.json', () => {
    const config = { accounts: [] };
    saveProfilesConfig('/config', config);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const [path, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(path).toContain('profiles.json');
    expect(JSON.parse(content)).toMatchObject({ accounts: [] });
  });
});
