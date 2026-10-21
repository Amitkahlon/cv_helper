// One AI service (Claude, ChatGPT, Gemini; through a CLI or an API key).
// Everything else talks to the AI only through this interface (plan section 2).
export interface AiProvider {
  name: string;
  // Asks for an answer that matches `schema` (a JSON Schema object) and returns it parsed.
  generateJson<T>(request: { system: string; prompt: string; schema: object }): Promise<T>;
}
