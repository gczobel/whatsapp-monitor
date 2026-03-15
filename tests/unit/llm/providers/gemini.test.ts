import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClient } from '../../../../src/llm/providers/gemini.js';

const config = {
  provider: 'gemini' as const,
  endpoint: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: 'test-api-key',
  model: 'gemini-pro',
};

function makeResponse(text: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: () => Promise.resolve('error body'),
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GeminiClient constructor', () => {
  it('should throw when apiKey is missing', () => {
    expect(
      () => new GeminiClient({ provider: 'gemini', endpoint: 'https://x.com', model: 'x' }),
    ).toThrow('apiKey is required');
  });
});

describe('GeminiClient.complete', () => {
  it('should return text from a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Hello from Gemini')));
    const client = new GeminiClient(config);
    const result = await client.complete('test prompt');
    expect(result).toBe('Hello from Gemini');
  });

  it('should include the model and apiKey in the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new GeminiClient(config);
    await client.complete('prompt');
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('gemini-pro');
    expect(url).toContain('test-api-key');
  });

  it('should send the prompt in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new GeminiClient(config);
    await client.complete('summarise this');
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as unknown;
    expect(JSON.stringify(body)).toContain('summarise this');
  });

  it('should throw on a non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('', false, 400)));
    const client = new GeminiClient(config);
    await expect(client.complete('prompt')).rejects.toThrow('Request failed');
  });

  it('should throw when response contains no text content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [] } }] }),
      } as unknown as Response),
    );
    const client = new GeminiClient(config);
    await expect(client.complete('prompt')).rejects.toThrow('no text content');
  });
});
