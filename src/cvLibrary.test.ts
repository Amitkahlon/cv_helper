import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCv, cvChoice, cvFilePath, deleteCv, loadCvs, saveCvs } from "./cvLibrary.js";
import { addJobs, readJobs } from "./jobsCsv.js";
import { createWorkspace, jobsCsvPath } from "./workspace.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "cvhelper-cvs-"));
  await createWorkspace(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("CV library", () => {
  it("adds files under safe, unique names and keeps the original name for display", async () => {
    const a = await addCv(workspace, Buffer.from("a"), "קורות חיים QA.pdf");
    const b = await addCv(workspace, Buffer.from("b"), "קורות חיים QA.pdf");
    expect(a).toEqual({ file: "QA.pdf", name: "קורות חיים QA", category: "", purpose: "" });
    expect(b.file).toBe("QA-2.pdf");
    expect(await readdir(path.join(workspace, "profile", "cvs"))).toEqual(["QA-2.pdf", "QA.pdf"]);
    await expect(addCv(workspace, Buffer.from("x"), "cv.txt")).rejects.toThrow("PDF or DOCX");
  });

  it("saves categories but never adds unknown files", async () => {
    await addCv(workspace, Buffer.from("a"), "qa.pdf");
    const saved = await saveCvs(workspace, [
      { file: "qa.pdf", name: "QA CV", category: "QA automation", purpose: "QA jobs" },
      { file: "../../secret.pdf", name: "x", category: "", purpose: "" },
    ]);
    expect(saved).toEqual([{ file: "qa.pdf", name: "QA CV", category: "QA automation", purpose: "QA jobs" }]);
    expect(await loadCvs(workspace)).toEqual(saved);
  });

  it("deleting a CV clears it from the jobs that chose it", async () => {
    await addCv(workspace, Buffer.from("a"), "qa.pdf");
    const csvPath = jobsCsvPath(workspace);
    await addJobs(csvPath, [
      { id: "1", cv_choice: cvChoice("qa.pdf") },
      { id: "2", cv_choice: "" },
    ]);
    await deleteCv(workspace, "qa.pdf");
    expect(await loadCvs(workspace)).toEqual([]);
    expect((await readJobs(csvPath)).rows.map((r) => r.cv_choice)).toEqual(["", ""]);
  });

  it("refuses file names that point outside the library", () => {
    expect(() => cvFilePath(workspace, "../profile.yaml")).toThrow("Bad CV file name");
  });
});
