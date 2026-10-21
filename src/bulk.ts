import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { JobRecord } from "./add.js";
import type { AiProvider } from "./ai/provider.js";
import { buildCv, isKnownChoice, suggestCvChoice } from "./cvBuild.js";
import { loadCvs } from "./cvLibrary.js";
import { today } from "./dates.js";
import { deleteJobs, readJobs, updateJob, updateJobs, type JobRow } from "./jobsCsv.js";
import { loadProfile } from "./profile.js";
import { fillRequirements, type Requirements } from "./requirements.js";
import { jobsCsvPath } from "./workspace.js";

// Actions on many jobs at once (the selected rows in the UI). Each action is one
// entry here; the server runs any of them through one endpoint and reports
// each job's result as it goes.

export interface BulkContext {
  workspace: string;
  params: Record<string, unknown>; // the action's inputs from the UI, e.g. { instructions: "..." }
  ai: () => Promise<AiProvider>; // created only when an action needs it
}

// Called once per job: ok, with an optional short message ("score 3/5", "no change").
export type Report = (id: string, ok: boolean, message?: string) => void;

export interface BulkAction {
  slow: boolean; // uses AI or takes long: only one slow action runs at a time
  run(ids: string[], context: BulkContext, report: Report): Promise<void>;
}

// Job ids are also folder names; anything else must not reach the file system.
const SAFE_ID = /^[A-Za-z0-9._-]+$/;
const isSubmitted = (row: JobRow) => (row.submitted ?? "").trim() !== "";
const param = (context: BulkContext, key: string) => String(context.params[key] ?? "").trim();

// A quick action that only changes tracker cells: all rows in one write.
// `changesFor` answers the cells to change for a row, or null for "nothing to do".
function cellAction(changesFor: (row: JobRow, context: BulkContext) => JobRow | null, check?: (context: BulkContext) => Promise<string>): BulkAction {
  return {
    slow: false,
    async run(ids, context, report) {
      const problem = check ? await check(context) : "";
      if (problem) throw new Error(problem);
      const csvPath = jobsCsvPath(context.workspace);
      const rows = new Map((await readJobs(csvPath)).rows.map((row) => [row.id, row]));
      const changes: Record<string, JobRow> = {};
      for (const id of ids) {
        const row = rows.get(id);
        if (!row) continue;
        const change = changesFor(row, context);
        if (change) changes[id] = change;
      }
      await updateJobs(csvPath, changes);
      for (const id of ids) {
        if (!rows.has(id)) report(id, false, "not in the tracker");
        else report(id, true, changes[id] ? undefined : "no change");
      }
    },
  };
}

// A slow action done job by job; one job failing doesn't stop the others.
function perJob(work: (id: string, context: BulkContext) => Promise<string | void>): BulkAction {
  return {
    slow: true,
    async run(ids, context, report) {
      for (const id of ids) {
        try {
          report(id, true, (await work(id, context)) || undefined);
        } catch (err) {
          report(id, false, (err instanceof Error ? err.message : String(err)).split("\n")[0]);
        }
      }
    },
  };
}

async function readJob(workspace: string, id: string): Promise<JobRecord> {
  if (!SAFE_ID.test(id)) throw new Error("Bad job id");
  try {
    return JSON.parse(await readFile(path.join(workspace, "jobs", id, "job.json"), "utf8"));
  } catch {
    throw new Error("No details saved for this job");
  }
}

const checkChoice = async (context: BulkContext) =>
  (await isKnownChoice(context.workspace, param(context, "choice"))) ? "" : `Unknown CV choice: ${param(context, "choice")}`;

export const BULK_ACTIONS: Record<string, BulkAction> = {
  submit: cellAction((row) => (isSubmitted(row) ? null : { submitted: "YES", submitted_date: today() })),

  unsubmit: cellAction((row) => (isSubmitted(row) ? { submitted: "", submitted_date: "" } : null)),

  // Hide jobs you won't apply to; Restore brings them back.
  skip: cellAction((row) => ((row.filter ?? "").trim() ? null : { filter: "rejected: skipped" })),

  restore: cellAction((row) => ((row.filter ?? "").trim() ? { filter: "" } : null)),

  // params.choice: a cv_choice value ("" clears it). A different CV makes the old build stale.
  "set-choice": cellAction((row, context) => {
    const choice = param(context, "choice");
    return row.cv_choice === choice ? null : { cv_choice: choice, cv_status: "", score: "" };
  }, checkChoice),

  // Removes the rows and the jobs' folders (details, CVs). Re-adding a link later adds it as new.
  delete: {
    slow: false,
    async run(ids, context, report) {
      const csvPath = jobsCsvPath(context.workspace);
      const known = new Set((await readJobs(csvPath)).rows.map((row) => row.id));
      await deleteJobs(csvPath, ids);
      for (const id of ids) {
        if (!known.has(id)) {
          report(id, false, "not in the tracker");
          continue;
        }
        if (SAFE_ID.test(id)) await rm(path.join(context.workspace, "jobs", id), { recursive: true, force: true });
        report(id, true);
      }
    },
  },

  requirements: perJob(async (id, context) => {
    const requirements = await fillRequirements(context.workspace, await context.ai(), id);
    return `${requirements.must_have.length} must-have`;
  }),

  "suggest-cv": perJob(async (id, context) => {
    const job = await readJob(context.workspace, id);
    const ai = await context.ai();
    const requirements = (job.requirements as Requirements | null) ?? (await fillRequirements(context.workspace, ai, id));
    const { roles } = await loadProfile(context.workspace);
    const choice = await suggestCvChoice(ai, job, requirements, roles, await loadCvs(context.workspace));
    await updateJob(jobsCsvPath(context.workspace), id, { cv_choice: choice, cv_status: "", score: "" });
    return choice;
  }),

  // params.choice (optional): use this CV for every job, e.g. "tailored: QA automation";
  // otherwise each job's own choice. params.instructions: extra instructions for tailored CVs.
  "build-cv": {
    slow: true,
    async run(ids, context, report) {
      const choice = param(context, "choice");
      if (choice) {
        const problem = await checkChoice(context);
        if (problem) throw new Error(problem);
      }
      await perJob(async (id) => {
        await readJob(context.workspace, id); // fails clearly when the job has no saved details
        if (choice) await updateJob(jobsCsvPath(context.workspace), id, { cv_choice: choice });
        const result = await buildCv(context.workspace, await context.ai(), id, { instructions: param(context, "instructions") });
        return `score ${result.score} (${result.choice})`;
      }).run(ids, context, report);
    },
  },
};
