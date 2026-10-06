import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Tracker columns, in order (plan section 4).
export const JOBS_CSV_COLUMNS = [
  "submitted", "notes", "score", "filter", "cv_status",
  "title", "company", "location", "requirements",
  "job_link", "agency_link", "cv_file",
  "posted_date", "first_seen", "submitted_date",
  "phone_call_date", "interview_date", "rejected_date", "offer_date",
  "id", "source_job_id",
];

export function jobsCsvPath(workspace: string): string {
  return path.join(workspace, "jobs.csv");
}

export async function workspaceExists(workspace: string): Promise<boolean> {
  try {
    await access(jobsCsvPath(workspace));
    return true;
  } catch {
    return false;
  }
}

// Creates the workspace folder and a jobs.csv with only the header row.
// An existing jobs.csv is never overwritten.
export async function createWorkspace(workspace: string): Promise<void> {
  await mkdir(workspace, { recursive: true });
  // The BOM makes Excel read the file as UTF-8 (needed for Hebrew text).
  const header = "﻿" + JOBS_CSV_COLUMNS.join(",") + "\n";
  try {
    await writeFile(jobsCsvPath(workspace), header, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
}
