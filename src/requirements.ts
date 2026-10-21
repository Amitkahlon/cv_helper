import { readFile, writeFile } from "node:fs/promises";
import { jobJsonPath, type JobRecord } from "./add.js";
import type { AiProvider } from "./ai/provider.js";
import { readJobs, updateJob } from "./jobsCsv.js";
import { jobsCsvPath } from "./workspace.js";

// The AI-filled `requirements` object in job.json (plan section 5).
export interface Requirements {
  work_model: "onsite" | "hybrid" | "remote" | "unknown";
  employment_type: "full-time" | "part-time" | "student" | "internship" | "contract" | "temporary" | "unknown";
  seniority: "entry" | "junior" | "mid" | "senior" | "lead" | "unknown";
  min_years_experience: number | null;
  field: string;
  must_have: { id: string; text: string }[];
  nice_to_have: { id: string; text: string }[];
  language_requirements: string[];
  asks_for_attachments: string[];
}

const item = {
  type: "object",
  properties: { id: { type: "string" }, text: { type: "string" } },
  required: ["id", "text"],
  additionalProperties: false,
};
const strings = { type: "array", items: { type: "string" } };

export const REQUIREMENTS_SCHEMA = {
  type: "object",
  properties: {
    work_model: { enum: ["onsite", "hybrid", "remote", "unknown"] },
    employment_type: {
      enum: ["full-time", "part-time", "student", "internship", "contract", "temporary", "unknown"],
    },
    seniority: { enum: ["entry", "junior", "mid", "senior", "lead", "unknown"] },
    min_years_experience: { type: ["integer", "null"] },
    field: { type: "string" },
    must_have: { type: "array", items: item },
    nice_to_have: { type: "array", items: item },
    language_requirements: strings,
    asks_for_attachments: strings,
  },
  required: [
    "work_model", "employment_type", "seniority", "min_years_experience", "field",
    "must_have", "nice_to_have", "language_requirements", "asks_for_attachments",
  ],
  additionalProperties: false,
};

const SYSTEM = `You read one job posting and list what it asks for, as structured data.
- Use only what the posting says. Never add requirements it doesn't state.
- must_have: requirements the posting presents as required. nice_to_have: those it calls an advantage,
  a plus, or preferred. Ids R1, R2, ... and N1, N2, ...
- Each requirement is one short line in English, keeping concrete details (tools, years, degrees),
  even when the posting is in Hebrew.
- field: a short label for the kind of job, e.g. "software QA", "backend development", "accounting".
- min_years_experience: the smallest number of years asked for, or null if none is stated.
- Use "unknown" when the posting doesn't say.
- language_requirements: spoken languages the job requires. A language listed only as an advantage
  goes in nice_to_have, not here.
- asks_for_attachments: documents the application must include besides a CV (e.g. transcript,
  portfolio).`;

export async function extractRequirements(ai: AiProvider, job: JobRecord): Promise<Requirements> {
  const prompt = [
    `Title: ${job.title}`,
    `Company: ${job.company || "(not given)"}`,
    `Location: ${job.location || "(not given)"}`,
    job.employment_type && `Employment type (as the site says): ${job.employment_type}`,
    job.seniority && `Seniority (as the site says): ${job.seniority}`,
    "",
    "Posting:",
    job.description || "(no description)",
  ]
    .filter((line) => line !== "")
    .join("\n");
  return ai.generateJson<Requirements>({ system: SYSTEM, prompt, schema: REQUIREMENTS_SCHEMA });
}

// The short summary for the CSV's requirements column.
export function requirementsSummary(requirements: Requirements): string {
  return requirements.must_have.map((r) => r.text).join("; ");
}

// Fills `requirements` in one job's job.json and the CSV summary.
export async function fillRequirements(
  workspace: string,
  ai: AiProvider,
  id: string,
  saveRow: (write: () => Promise<void>) => Promise<boolean> = async (write) => {
    await write();
    return true;
  },
): Promise<Requirements> {
  const file = jobJsonPath(workspace, id);
  const job: JobRecord = JSON.parse(await readFile(file, "utf8"));
  const requirements = await extractRequirements(ai, job);
  job.requirements = requirements;
  await writeFile(file, JSON.stringify(job, null, 2) + "\n", "utf8");
  await saveRow(() =>
    updateJob(jobsCsvPath(workspace), id, { requirements: requirementsSummary(requirements) }),
  );
  return requirements;
}

// Ids of the jobs that still need requirements: they have a job.json without
// them, and (unless `all`) aren't submitted or rejected.
export async function jobsNeedingRequirements(workspace: string, all: boolean): Promise<string[]> {
  const { rows } = await readJobs(jobsCsvPath(workspace));
  const ids: string[] = [];
  for (const row of rows) {
    if (!all && ((row.submitted ?? "").trim() || (row.filter ?? "").trim())) continue;
    try {
      const job: JobRecord = JSON.parse(await readFile(jobJsonPath(workspace, row.id), "utf8"));
      if (job.requirements == null) ids.push(row.id);
    } catch {
      // no job.json: nothing to read requirements from
    }
  }
  return ids;
}
