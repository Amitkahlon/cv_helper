import { claudeCli } from "./claudeCli.js";
import type { AiProvider } from "./provider.js";

// The AI service in use. Version 1: Claude through the Claude Code CLI, with
// Sonnet (fast enough for many jobs). Choosing a provider in config.yaml comes later.
export function defaultAi(): AiProvider {
  return claudeCli({ model: "sonnet" });
}
