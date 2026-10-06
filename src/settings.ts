import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface Settings {
  workspace: string;
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

// Returns undefined when there are no settings yet or the file can't be used.
export async function loadSettings(): Promise<Settings | undefined> {
  try {
    const data = JSON.parse(await readFile(settingsPath(), "utf8"));
    if (typeof data?.workspace === "string") return { workspace: data.workspace };
  } catch {
    // missing or broken file: treated as "not set up"
  }
  return undefined;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await mkdir(settingsDir(), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2) + "\n", "utf8");
}
