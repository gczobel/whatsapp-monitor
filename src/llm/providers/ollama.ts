import type { LLMClient } from '../interface.js';
import type { LLMConfig } from '../../config/app.js';

interface OllamaResponse {
  response: string;
  done: boolean;
}

/**
 * Ollama provider for local LLM inference.
 * Uses Ollama's native /api/generate endpoint (non-streaming mode).
 * No API key required — Ollama is self-hosted.
 */
export class OllamaClient implements LLMClient {
  private readonly endpoint: string;
  private readonly model: string;

  constructor(config: LLMConfig) {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }

  async complete(prompt: string): Promise<string> {
    const url = `${this.endpoint}/api/generate`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `[llm/ollama] Request failed: ${response.status} ${response.statusText} — ${body}`,
      );
    }

    const data = (await response.json()) as OllamaResponse;

    if (!data.response) {
      throw new Error('[llm/ollama] Response contained no text content');
    }

    return data.response;
  }
}
