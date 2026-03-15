import { describe, it, expect } from 'vitest';
import { createLLMClient } from '../../../src/llm/factory.js';
import { GeminiClient } from '../../../src/llm/providers/gemini.js';
import { OpenAIClient } from '../../../src/llm/providers/openai.js';
import { OllamaClient } from '../../../src/llm/providers/ollama.js';

const baseConfig = {
  endpoint: 'https://example.com',
  model: 'test-model',
};

describe('createLLMClient', () => {
  it('should return a GeminiClient for provider "gemini"', () => {
    const client = createLLMClient({
      ...baseConfig,
      provider: 'gemini',
      apiKey: 'test-key',
    });
    expect(client).toBeInstanceOf(GeminiClient);
  });

  it('should return an OpenAIClient for provider "openai"', () => {
    const client = createLLMClient({
      ...baseConfig,
      provider: 'openai',
      apiKey: 'sk-test',
    });
    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it('should return an OllamaClient for provider "ollama"', () => {
    const client = createLLMClient({
      ...baseConfig,
      provider: 'ollama',
    });
    expect(client).toBeInstanceOf(OllamaClient);
  });

  it('should throw if gemini is missing apiKey', () => {
    expect(() => createLLMClient({ ...baseConfig, provider: 'gemini' })).toThrow(
      'apiKey is required',
    );
  });

  it('should throw if openai is missing apiKey', () => {
    expect(() => createLLMClient({ ...baseConfig, provider: 'openai' })).toThrow(
      'apiKey is required',
    );
  });
});
