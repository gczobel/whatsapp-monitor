import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIClient } from '../../../../src/llm/providers/openai.js';

const config = {
  provider: 'openai' as const,
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key',
  model: 'gpt-4',
};

function makeResponse(content: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Unauthorized',
    json: () => Promise.resolve({ choices: [{ message: { role: 'assistant', content } }] }),
    text: () => Promise.resolve('error body'),
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('OpenAIClient constructor', () => {
  it('should throw when apiKey is missing', () => {
    expect(
      () => new OpenAIClient({ provider: 'openai', endpoint: 'https://x.com', model: 'x' }),
    ).toThrow('apiKey is required');
  });
});

describe('OpenAIClient.complete', () => {
  it('should return content from a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Hello from OpenAI')));
    const client = new OpenAIClient(config);
    const result = await client.complete('test prompt');
    expect(result).toBe('Hello from OpenAI');
  });

  it('should send Authorization Bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenAIClient(config);
    await client.complete('prompt');
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test-key');
  });

  it('should target the /chat/completions endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenAIClient(config);
    await client.complete('prompt');
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('/chat/completions');
  });

  it('should include model and prompt in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenAIClient(config);
    await client.complete('test message');
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as unknown;
    expect(JSON.stringify(body)).toContain('gpt-4');
    expect(JSON.stringify(body)).toContain('test message');
  });

  it('should throw on a non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('', false, 401)));
    const client = new OpenAIClient(config);
    await expect(client.complete('prompt')).rejects.toThrow('Request failed');
  });

  it('should throw when response contains no content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      } as unknown as Response),
    );
    const client = new OpenAIClient(config);
    await expect(client.complete('prompt')).rejects.toThrow('no content');
  });
});
