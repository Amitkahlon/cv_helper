import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BULK_ACTIONS, type BulkContext } from "./bulk.js";
import { addCv, cvChoice } from "./cvLibrary.js";
import { addJobs, readJobs } from "./jobsCsv.js";
import { createWorkspace, jobsCsvPath } from "./workspace.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "cvhelper-bulk-"));
  await createWorkspace(workspace);
  await addJobs(jobsCsvPath(workspace), [
    { id: "a", title: "A" },
    { id: "b", title: "B", submitted: "YES", submitted_date: "2026-10-01" },
    { id: "c", title: "C", filter: "rejected: closed" },
  ]);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

// Runs an action and collects its per-job reports.
async function run(action: string, ids: string[], params: Record<string, unknown> = {}) {
  const results: Record<string, [boolean, string | undefined]> = {};
  const context: BulkContext = { workspace, params, ai: async () => { throw new Error("no AI in tests"); } };
  await BULK_ACTIONS[action].run(ids, context, (id, ok, message) => (results[id] = [ok, message]));
  return results;
}

const rows = async () => Object.fromEntries((await readJobs(jobsCsvPath(workspace))).rows.map((r) => [r.id, r]));

describe("bulk actions", () => {
  it("marks submitted only the jobs that aren't, keeping existing dates", async () => {
    expect(await run("submit", ["a", "b", "zz"])).toEqual({ a: [true, undefined], b: [true, "no change"], zz: [false, "not in the tracker"] });
    const r = await rows();
    expect(r.a.submitted).toBe("YES");
    expect(r.a.submitted_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.b.submitted_date).toBe("2026-10-01");
    await run("unsubmit", ["a", "b"]);
    expect(Object.values(await rows()).map((x) => x.submitted)).toEqual(["", "", ""]);
  });

  it("skips and restores", async () => {
    await run("skip", ["a", "c"]);
    let r = await rows();
    expect([r.a.filter, r.c.filter]).toEqual(["rejected: skipped", "rejected: closed"]);
    await run("restore", ["a", "c"]);
    r = await rows();
    expect([r.a.filter, r.c.filter]).toEqual(["", ""]);
  });

  it("sets a known CV choice and refuses unknown ones", async () => {
    await addCv(workspace, Buffer.from("x"), "qa.pdf");
    await run("set-choice", ["a", "b"], { choice: cvChoice("qa.pdf") });
    expect((await rows()).b.cv_choice).toBe("predefined: qa.pdf");
    await expect(run("set-choice", ["a"], { choice: "predefined: nope.pdf" })).rejects.toThrow("Unknown CV choice");
  });

  it("deletes rows and their job folders", async () => {
    await mkdir(path.join(workspace, "jobs", "a"), { recursive: true });
    await writeFile(path.join(workspace, "jobs", "a", "job.json"), "{}");
    expect(await run("delete", ["a", "zz"])).toEqual({ a: [true, undefined], zz: [false, "not in the tracker"] });
    expect(Object.keys(await rows())).toEqual(["b", "c"]);
    await expect(stat(path.join(workspace, "jobs", "a"))).rejects.toThrow();
  });

  it("reports each job's failure in slow actions without stopping", async () => {
    const results = await run("build-cv", ["a", "b"]);
    expect(results.a[0]).toBe(false);
    expect(results.b[0]).toBe(false);
    expect(results.a[1]).toContain("No details saved");
  });
});
