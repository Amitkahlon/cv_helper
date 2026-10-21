import type { AiProvider } from "./provider.js";

export const OPENAI_DEFAULT_MODEL = "gpt-5";

// ChatGPT through the OpenAI Responses API with a strict JSON schema, paid per use.
export function openaiApi(options: { apiKey?: string; model?: string } = {}): AiProvider {
  const model = options.model || OPENAI_DEFAULT_MODEL;
  return {
    name: `openai-api (${model})`,
    async generateJson<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("No OpenAI API key: add one in Settings");
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          instructions: system,
          input: prompt,
          text: { format: { type: "json_schema", name: "answer", schema, strict: true } },
        }),
      });
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${data?.error?.message ?? ""}`);
      const text = (data.output ?? [])
        .flatMap((item: any) => item.content ?? [])
        .filter((part: any) => part.type === "output_text")
        .map((part: any) => part.text)
        .join("");
      if (!text) throw new Error("OpenAI API gave no answer");
      return JSON.parse(text) as T;
    },
  };
}
