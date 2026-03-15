/**
 * The LLM client interface. All providers implement this.
 * Business logic depends only on this interface — never on a concrete provider.
 */
export interface LLMClient {
  complete(prompt: string): Promise<string>;
}
