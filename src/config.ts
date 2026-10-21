import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

// <workspace>/config.yaml: settings for one workspace (plan section 3).

export const PROVIDERS = {
  "claude-cli": "Claude, through the Claude Code CLI (your subscription, no key)",
  "anthropic-api": "Claude, through the Anthropic API (API key)",
  "openai-api": "ChatGPT, through the OpenAI API (API key)",
  "gemini-api": "Gemini, through the Google Gemini API (API key)",
  "codex-cli": "ChatGPT, through the Codex CLI (your subscription, no key)",
  "gemini-cli": "Gemini, through the Gemini CLI (your Google account, no key)",
} as const;
export type ProviderName = keyof typeof PROVIDERS;

export interface Filters {
  reject_employment_types: string[]; // e.g. internship, student, part-time
  accept_fields: string[]; // empty = any field
  max_min_years_experience: number | null; // reject jobs asking for more years than this
  reject_keywords: string[]; // reject jobs whose posting mentions any of these
  locations: string[]; // empty = anywhere; remote jobs always pass
}

export interface Config {
  ai: { provider: ProviderName; model: string }; // model "" = the provider's default
  filters: Filters;
  cv: { font: string; accent_color: string; font_size: number };
}

export function defaultConfig(): Config {
  return cleanConfig({});
}

export function cleanConfig(c: any): Config {
  const provider = c?.ai?.provider in PROVIDERS ? (c.ai.provider as ProviderName) : "claude-cli";
  const years = Number(c?.filters?.max_min_years_experience);
  const size = Number(c?.cv?.font_size);
  return {
    ai: { provider, model: str(c?.ai?.model) },
    filters: {
      reject_employment_types: strs(c?.filters?.reject_employment_types),
      accept_fields: strs(c?.filters?.accept_fields),
      max_min_years_experience:
        c?.filters?.max_min_years_experience == null || c.filters.max_min_years_experience === "" || isNaN(years)
          ? null
          : years,
      reject_keywords: strs(c?.filters?.reject_keywords),
      locations: strs(c?.filters?.locations),
    },
    cv: {
      font: str(c?.cv?.font) || "Calibri, Arial, sans-serif",
      accent_color: /^#[0-9a-f]{3,8}$/i.test(str(c?.cv?.accent_color)) ? str(c.cv.accent_color) : "#1f4e79",
      font_size: size >= 8 && size <= 14 ? size : 10.5,
    },
  };
}

function configPath(workspace: string): string {
  return path.join(workspace, "config.yaml");
}

export async function loadConfig(workspace: string): Promise<Config> {
  try {
    return cleanConfig(YAML.parse(await readFile(configPath(workspace), "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw err;
  }
}

export async function saveConfig(workspace: string, config: unknown): Promise<Config> {
  const cleaned = cleanConfig(config);
  const header = [
    "# cvhelper settings for this workspace (also editable in the UI's Settings tab).",
    `# ai.provider: one of ${Object.keys(PROVIDERS).join(", ")}; ai.model "" = the provider's default.`,
    "# filters: jobs matching these get 'rejected: <reason>' in the tracker's filter column.",
    "",
  ].join("\n");
  await writeFile(configPath(workspace), header + YAML.stringify(cleaned), "utf8");
  return cleaned;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function strs(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter(Boolean) : [];
}
