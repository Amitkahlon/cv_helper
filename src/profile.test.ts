import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanProfile, DEFAULT_RULES, loadProfile, safeFileName, saveProfile } from "./profile.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "cvhelper-profile-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("cleanProfile", () => {
  it("fills missing fields, trims text and drops empty items", () => {
    const profile = cleanProfile({
      personal: { name: "  Amit  ", links: ["https://x.com", ""] },
      experience: [
        { role: "QA Engineer", start: 2022, facts: ["Built a framework", " "] },
        { role: "", facts: [] },
      ],
    });
    expect(profile.personal).toEqual({
      name: "Amit", email: "", phone: "", city: "", links: ["https://x.com"], summary: "",
    });
    expect(profile.experience).toEqual([
      { role: "QA Engineer", organization: "", start: "2022", end: "", location: "", facts: ["Built a framework"], skills: [] },
    ]);
    expect(profile.projects).toEqual([]);
    expect(profile.preferences.notes).toBe("");
  });
});

describe("loadProfile / saveProfile", () => {
  it("gives defaults before anything is saved", async () => {
    const data = await loadProfile(workspace);
    expect(data.exists).toBe(false);
    expect(data.rules).toBe(DEFAULT_RULES);
    expect(data.roles).toEqual([]);
  });

  it("saves YAML and reads it back, keeping Hebrew", async () => {
    await saveProfile(workspace, {
      profile: { personal: { name: "עמית" }, skills: [{ group: "Tools", items: ["Playwright"] }] },
      roles: [{ name: "QA automation", fits: "QA automation jobs", emphasis: "" }],
      rules: "# My rules\n",
    });
    const data = await loadProfile(workspace);
    expect(data.exists).toBe(true);
    expect(data.profile.personal.name).toBe("עמית");
    expect(data.profile.skills).toEqual([{ group: "Tools", items: ["Playwright"] }]);
    expect(data.roles[0].name).toBe("QA automation");
    expect(data.rules).toBe("# My rules\n");
    expect(await readFile(path.join(workspace, "profile", "profile.yaml"), "utf8")).toMatch(/^# Your facts/);
  });
});

describe("safeFileName", () => {
  it("keeps only safe ASCII characters and no folders", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("קורות חיים – Amit's CV.PDF")).toBe("Amit_s CV.pdf");
    expect(safeFileName("קורות חיים.pdf")).toBe("file.pdf");
    expect(safeFileName("C:\\Users\\me\\cv.docx")).toBe("cv.docx");
  });
});
