import type { LLMClient } from './interface.js';
import type { LLMConfig } from '../config/app.js';
import { GeminiClient } from './providers/gemini.js';
import { OpenAIClient } from './providers/openai.js';
import { OllamaClient } from './providers/ollama.js';

/**
 * Creates the correct LLM client based on the provider field in config.
 * The rest of the application only sees the LLMClient interface.
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'gemini':
      return new GeminiClient(config);
    case 'openai':
      return new OpenAIClient(config);
    case 'ollama':
      return new OllamaClient(config);
    default: {
      // TypeScript exhaustiveness guard — this branch is unreachable at runtime.
      const unreachable: never = config.provider;
      throw new Error(`[llm/factory] Unknown provider: ${String(unreachable)}`);
    }
  }
}
