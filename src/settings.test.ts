import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "./settings.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "cvhelper-settings-"));
  vi.stubEnv("XDG_CONFIG_HOME", dir);
  vi.stubEnv("APPDATA", dir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("saveSettings", () => {
  it("keeps API keys saved before a workspace was chosen", async () => {
    await saveSettings({ api_keys: { openai: "sk-1" } });
    expect(await loadSettings()).toBeUndefined(); // no workspace yet
    await saveSettings({ workspace: "/jobs" });
    expect(await loadSettings()).toEqual({ workspace: "/jobs", api_keys: { openai: "sk-1" } });
  });
});
