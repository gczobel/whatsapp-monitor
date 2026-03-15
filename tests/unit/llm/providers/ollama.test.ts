import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaClient } from '../../../../src/llm/providers/ollama.js';

const config = {
  provider: 'ollama' as const,
  endpoint: 'http://localhost:11434',
  model: 'llama3',
};

function makeResponse(responseText: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve({ response: responseText, done: true }),
    text: () => Promise.resolve('error body'),
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('OllamaClient constructor', () => {
  it('should not throw when apiKey is absent (Ollama is keyless)', () => {
    expect(() => new OllamaClient(config)).not.toThrow();
  });
});

describe('OllamaClient.complete', () => {
  it('should return response text from a successful call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Hello from Ollama')));
    const client = new OllamaClient(config);
    const result = await client.complete('test prompt');
    expect(result).toBe('Hello from Ollama');
  });

  it('should target the /api/generate endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OllamaClient(config);
    await client.complete('prompt');
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/generate');
  });

  it('should include model and prompt in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OllamaClient(config);
    await client.complete('my question');
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as unknown;
    expect(JSON.stringify(body)).toContain('llama3');
    expect(JSON.stringify(body)).toContain('my question');
  });

  it('should send stream: false to disable streaming', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OllamaClient(config);
    await client.complete('prompt');
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
      stream: boolean;
    };
    expect(body.stream).toBe(false);
  });

  it('should throw on a non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('', false, 500)));
    const client = new OllamaClient(config);
    await expect(client.complete('prompt')).rejects.toThrow('Request failed');
  });

  it('should throw when response contains no text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: '', done: true }),
      } as unknown as Response),
    );
    const client = new OllamaClient(config);
    await expect(client.complete('prompt')).rejects.toThrow('no text content');
  });
});
