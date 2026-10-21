import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Per-user settings, outside any workspace (so a synced workspace never carries
// API keys): which workspace to use, and API keys for AI providers.
export interface Settings {
  workspace: string;
  api_keys?: { anthropic?: string; openai?: string; gemini?: string };
}

// Per-user settings folder: %APPDATA% on Windows, ~/Library/Application Support
// on macOS, $XDG_CONFIG_HOME or ~/.config on Linux.
function settingsDir(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "cvhelper");
    case "darwin":
      return path.join(home, "Library", "Application Support", "cvhelper");
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "cvhelper");
  }
}

export function settingsPath(): string {
  return path.join(settingsDir(), "settings.json");
}

// cvhelper's own browser profile; site logins (e.g. HireMe) are remembered here.
export function browserProfileDir(): string {
  return path.join(settingsDir(), "browser");
}

// Returns undefined until a workspace has been chosen (or if the file can't be used).
export async function loadSettings(): Promise<Settings | undefined> {
  const data = await readSettingsFile();
  return typeof data.workspace === "string" ? { workspace: data.workspace, api_keys: cleanKeys(data.api_keys) } : undefined;
}

// Saves the given fields, keeping everything else in the file (e.g. changing the
// workspace keeps the API keys, even ones saved before any workspace was chosen).
export async function saveSettings(changes: Partial<Settings>): Promise<void> {
  const current = await readSettingsFile();
  const next = { ...current, ...changes, api_keys: cleanKeys(changes.api_keys ?? current.api_keys) };
  await mkdir(settingsDir(), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(next, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
}

async function readSettingsFile(): Promise<Record<string, any>> {
  try {
    const data = JSON.parse(await readFile(settingsPath(), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {}; // missing or broken file
  }
}

function cleanKeys(keys: any): Settings["api_keys"] {
  const out: NonNullable<Settings["api_keys"]> = {};
  for (const name of ["anthropic", "openai", "gemini"] as const) {
    if (typeof keys?.[name] === "string" && keys[name].trim()) out[name] = keys[name].trim();
  }
  return out;
}
