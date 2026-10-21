import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { loadRules, saveRules } from "./rules.js";
import { cleanRules, rulesMarkdown } from "./rulesText.js";
import { createWorkspace } from "./workspace.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "cvhelper-rules-"));
  await createWorkspace(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("rulesMarkdown", () => {
  it("always starts with the honesty rule and leaves out empty sections", () => {
    const md = rulesMarkdown(cleanRules({}));
    expect(md).toContain("## Honesty (never break)\n\n- Never claim");
    expect(md).toContain("- 1 page: be selective");
    expect(md).toContain("- Write the CV in English.");
    expect(md).not.toContain("## By kind of job");
  });

  it("writes skill framing and per-role rules", () => {
    const md = rulesMarkdown(
      cleanRules({
        language: "the same language as the job posting",
        skill_framing: [{ skill: "C++", rule: "never claim experience; say 'actively learning C++'" }],
        role_rules: [{ role: "QA automation", leave_out: "the ChronicalAI project", section_order: "experience, projects, skills, education" }],
        skip_jobs: ["Native mobile jobs"],
      }),
    );
    expect(md).toContain("Write the CV in the same language as the job posting.");
    expect(md).toContain("- **C++**: never claim experience; say 'actively learning C++'");
    expect(md).toContain("### QA automation\n- Leave out: the ChronicalAI project\n- Section order: experience, projects, skills, education");
    expect(md).toContain("- Native mobile jobs");
  });
});

describe("saveRules", () => {
  it("saves the answers and rules.md, and adds skip keywords to the filters", async () => {
    expect(await loadRules(workspace)).toBeNull();
    await saveRules(workspace, { pages: 2, other: ["AI tools only in summary or skills"] }, ["FPGA", "UVM"]);
    expect((await loadRules(workspace))?.pages).toBe(2);
    expect(await readFile(path.join(workspace, "profile", "rules.md"), "utf8")).toContain("- AI tools only in summary or skills");
    expect((await loadConfig(workspace)).filters.reject_keywords).toEqual(["FPGA", "UVM"]);
    await saveRules(workspace, {}, ["UVM", "Vue.js"]);
    expect((await loadConfig(workspace)).filters.reject_keywords).toEqual(["FPGA", "UVM", "Vue.js"]);
  });
});
