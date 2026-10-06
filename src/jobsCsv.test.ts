import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addJobs, readJobs, updateJob } from "./jobsCsv.js";

let dir: string;
let csvPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "cvhelper-test-"));
  csvPath = path.join(dir, "jobs.csv");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeCsv(lines: string[]): Promise<void> {
  await writeFile(csvPath, "﻿" + lines.join("\n") + "\n", "utf8");
}

describe("readJobs", () => {
  it("reads columns and rows, without the BOM", async () => {
    await writeCsv(["id,title", "1,QA Engineer"]);
    const table = await readJobs(csvPath);
    expect(table.columns).toEqual(["id", "title"]);
    expect(table.rows).toEqual([{ id: "1", title: "QA Engineer" }]);
  });
});

describe("addJobs", () => {
  it("appends rows and keeps the BOM", async () => {
    await writeCsv(["id,title", "1,QA Engineer"]);
    await addJobs(csvPath, [{ id: "2", title: "DevOps" }]);
    expect((await readFile(csvPath, "utf8")).startsWith("﻿")).toBe(true);
    expect((await readJobs(csvPath)).rows.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("keeps commas, quotes, line breaks and Hebrew intact", async () => {
    await writeCsv(["id,notes"]);
    const notes = 'מהנדס QA, "senior"\nsecond line';
    await addJobs(csvPath, [{ id: "1", notes }]);
    expect((await readJobs(csvPath)).rows[0].notes).toBe(notes);
  });
});

describe("updateJob", () => {
  it("changes only the given cells and keeps user columns in place", async () => {
    await writeCsv(["id,my_column,submitted", "1,keep,", "2,also keep,"]);
    await updateJob(csvPath, "1", { submitted: "YES" });
    const table = await readJobs(csvPath);
    expect(table.columns).toEqual(["id", "my_column", "submitted"]);
    expect(table.rows).toEqual([
      { id: "1", my_column: "keep", submitted: "YES" },
      { id: "2", my_column: "also keep", submitted: "" },
    ]);
  });

  it("adds a missing column at the end", async () => {
    await writeCsv(["id,title", "1,QA"]);
    await updateJob(csvPath, "1", { notes: "called" });
    const table = await readJobs(csvPath);
    expect(table.columns).toEqual(["id", "title", "notes"]);
    expect(table.rows[0].notes).toBe("called");
  });

  it("fails for an unknown id", async () => {
    await writeCsv(["id,title", "1,QA"]);
    await expect(updateJob(csvPath, "9", { notes: "x" })).rejects.toThrow("No job with id 9");
  });
});
