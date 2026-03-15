import type { LLMClient } from '../interface.js';
import type { LLMConfig } from '../../config/app.js';

interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
}

/**
 * OpenAI-compatible provider. Works with any endpoint that implements the
 * OpenAI Chat Completions API, including Azure OpenAI and local proxies.
 */
export class OpenAIClient implements LLMClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) {
      throw new Error('[llm/openai] apiKey is required for the OpenAI provider');
    }
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async complete(prompt: string): Promise<string> {
    const url = `${this.endpoint}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `[llm/openai] Request failed: ${response.status} ${response.statusText} — ${body}`,
      );
    }

    const data = (await response.json()) as OpenAIResponse;
    const content = data.choices[0]?.message?.content;

    if (content === undefined || content === null) {
      throw new Error('[llm/openai] Response contained no content');
    }

    return content;
  }
}
