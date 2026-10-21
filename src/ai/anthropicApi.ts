import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "./provider.js";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

// Claude through the Anthropic API, paid per use. Without an apiKey the SDK
// finds credentials itself (ANTHROPIC_API_KEY, or an `ant auth login` profile).
export function anthropicApi(options: { apiKey?: string; model?: string } = {}): AiProvider {
  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
  const model = options.model || ANTHROPIC_DEFAULT_MODEL;
  return {
    name: `anthropic-api (${model})`,
    async generateJson<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      const response = await client.beta.messages
        .stream({
          model,
          max_tokens: 32000,
          system,
          messages: [{ role: "user", content: prompt }],
          output_config: { effort: "medium", format: { type: "json_schema", schema: schema as Record<string, unknown> } },
          // If a safety check declines the request, the API retries it on a suitable fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
        .finalMessage();
      if (response.stop_reason === "refusal") {
        throw new Error(`Claude declined the request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
      }
      if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (too long)");
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      return JSON.parse(text) as T;
    },
  };
}
