import type { AiProvider } from "./provider.js";

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

// Gemini through the Google Gemini API with a JSON schema, paid per use (or free tier).
export function geminiApi(options: { apiKey?: string; model?: string } = {}): AiProvider {
  const model = options.model || GEMINI_DEFAULT_MODEL;
  return {
    name: `gemini-api (${model})`,
    async generateJson<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("No Gemini API key: add one in Settings");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
        }),
      });
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${data?.error?.message ?? ""}`);
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((part: any) => part.text ?? "").join("");
      if (!text) throw new Error("Gemini API gave no answer");
      return JSON.parse(text) as T;
    },
  };
}
