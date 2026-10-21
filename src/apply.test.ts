import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cvFileName, prepareJobCv } from "./apply.js";
import { addCv, cvChoice } from "./cvLibrary.js";
import { addJobs, readJobs } from "./jobsCsv.js";
import { saveProfile } from "./profile.js";
import { createWorkspace, jobsCsvPath } from "./workspace.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "cvhelper-apply-"));
  await createWorkspace(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("cvFileName", () => {
  it("names the CV after the person, in safe ASCII", () => {
    expect(cvFileName("Amit Kahlon", ".pdf")).toBe("Amit_Kahlon_CV.pdf");
    expect(cvFileName("עמית כהלון", ".pdf")).toBe("CV.pdf");
    expect(cvFileName("", ".docx")).toBe("CV.docx");
  });
});

describe("prepareJobCv", () => {
  it("copies the chosen library CV into the job folder and records cv_file", async () => {
    await saveProfile(workspace, { profile: { personal: { name: "Amit Kahlon" } }, roles: [], rules: "" });
    await addCv(workspace, Buffer.from("qa cv"), "qa.pdf");
    await addJobs(jobsCsvPath(workspace), [{ id: "linkedin-1", cv_choice: cvChoice("qa.pdf") }, { id: "linkedin-2" }]);

    const file = await prepareJobCv(workspace, "linkedin-1");
    expect(file).toBe(path.join(workspace, "jobs", "linkedin-1", "Amit_Kahlon_CV.pdf"));
    expect(await readFile(file, "utf8")).toBe("qa cv");
    const row = (await readJobs(jobsCsvPath(workspace))).rows[0];
    expect(row.cv_file).toBe("jobs/linkedin-1/Amit_Kahlon_CV.pdf");

    await expect(prepareJobCv(workspace, "linkedin-2")).rejects.toThrow("Choose a CV");
  });
});
