import { loadConfig, type ProviderName } from "../config.js";
import { loadSettings } from "../settings.js";
import { anthropicApi } from "./anthropicApi.js";
import { claudeCli } from "./claudeCli.js";
import { geminiApi } from "./geminiApi.js";
import { openaiApi } from "./openaiApi.js";
import { codexCli, geminiCli } from "./otherClis.js";
import type { AiProvider } from "./provider.js";

// The AI service a workspace uses: config.yaml's ai.provider and ai.model, with
// API keys from the per-user settings (or the usual environment variables).
export async function workspaceAi(workspace: string): Promise<AiProvider> {
  const { ai } = await loadConfig(workspace);
  const keys = (await loadSettings())?.api_keys ?? {};
  return makeProvider(ai.provider, ai.model, keys);
}

export function makeProvider(
  provider: ProviderName,
  model: string,
  keys: { anthropic?: string; openai?: string; gemini?: string },
): AiProvider {
  switch (provider) {
    case "anthropic-api":
      return anthropicApi({ apiKey: keys.anthropic, model });
    case "openai-api":
      return openaiApi({ apiKey: keys.openai, model });
    case "gemini-api":
      return geminiApi({ apiKey: keys.gemini, model });
    case "codex-cli":
      return codexCli({ model });
    case "gemini-cli":
      return geminiCli({ model });
    default:
      // Sonnet by default: fast enough for many jobs, on the user's subscription.
      return claudeCli({ model: model || "sonnet" });
  }
}
