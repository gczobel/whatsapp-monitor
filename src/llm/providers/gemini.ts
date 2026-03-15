import type { LLMClient } from '../interface.js';
import type { LLMConfig } from '../../config/app.js';

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content: GeminiContent;
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
}

export class GeminiClient implements LLMClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) {
      throw new Error('[llm/gemini] apiKey is required for the Gemini provider');
    }
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async complete(prompt: string): Promise<string> {
    const url = `${this.endpoint}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `[llm/gemini] Request failed: ${response.status} ${response.statusText} — ${body}`,
      );
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates[0]?.content?.parts[0]?.text;

    if (text === undefined || text === null) {
      throw new Error('[llm/gemini] Response contained no text content');
    }

    return text;
  }
}
