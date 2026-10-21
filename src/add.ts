import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { today } from "./dates.js";
import { JobNotFoundError, type ScrapedJob } from "./job.js";
import { jobIdFor, knownKeys, linkInfo, type LinkInfo } from "./jobKey.js";
import { addJobs, readJobs, type JobRow } from "./jobsCsv.js";
import { browserProfileDir } from "./settings.js";
import { fetchHiremeJob, openHiremeBrowser } from "./sources/hireme.js";
import { fetchGenericJob } from "./sources/generic.js";
import { fetchLinkedinJob } from "./sources/linkedin.js";
import { workspaceAi } from "./ai/default.js";
import type { AiProvider } from "./ai/provider.js";
import { repostOf } from "./repost.js";
import { jobsCsvPath } from "./workspace.js";

// Pause after each job, per site (LinkedIn rate-limits quickly, lesson 9.10).
const PAUSE_MS: Record<string, number> = { hireme: 1000, linkedin: 2000, other: 1000 };

// What goes into jobs/<id>/job.json (plan section 5).
export interface JobRecord extends Omit<ScrapedJob, "employer_link"> {
  id: string;
  source: string;
  source_job_id: string;
  job_link: string;
  agency_link: string | null;
  first_seen: string;
  requirements: unknown; // null until the AI step fills it
}

export type Outcome =
  | "added" | "closed" | "repost" | "duplicate" | "unsupported" | "not found" | "failed" | "cancelled";

export interface LinkResult {
  link: string;
  outcome: Outcome;
  id?: string;
  title?: string;
  detail?: string;
}

export interface AddOptions {
  // Runs one CSV write; returns false if the user cancelled (file stayed locked).
  saveRow: (write: () => Promise<void>) => Promise<boolean>;
  onResult: (result: LinkResult) => void;
}

export async function addLinks(
  workspace: string,
  links: string[],
  options: AddOptions,
): Promise<{ results: LinkResult[]; loggedOut: boolean }> {
  const csvPath = jobsCsvPath(workspace);
  const existingRows = (await readJobs(csvPath)).rows;
  const known = knownKeys(existingRows);
  // Titles and descriptions of the jobs so far, for spotting reposts; descriptions are read when needed.
  const earlier = existingRows.map((row) => ({ id: row.id, title: row.title ?? "", description: "" }));
  const descriptionsOf = async (title: string) => {
    for (const e of earlier) {
      if (!e.description && e.title.trim().toLowerCase() === title.trim().toLowerCase()) {
        e.description = await readFile(jobJsonPath(workspace, e.id), "utf8").then((t) => JSON.parse(t).description ?? "", () => "");
      }
    }
    return earlier;
  };
  const results: LinkResult[] = [];
  const report = (result: LinkResult) => {
    results.push(result);
    options.onResult(result);
  };

  let browser: { context: BrowserContext; page: Page } | undefined;
  let browserError = ""; // set if the HireMe browser couldn't be opened; later HireMe links fail fast
  let ai: Promise<AiProvider> | undefined; // only needed for pages without job data
  const getAi = () => (ai ??= workspaceAi(workspace));
  let hiremeReads = 0;
  let loggedOutReads = 0;

  try {
    for (const link of links) {
      const info = linkInfo(link);
      if (known.has(info.key)) {
        report({ link, outcome: "duplicate" });
        continue;
      }
      const siteJobId = info.siteJobId ?? "";
      const isPage = /^https?:\/\//i.test(link);
      if ((info.site === "other" && !isPage) || (info.site !== "other" && !siteJobId)) {
        report({ link, outcome: "unsupported" });
        continue;
      }

      let job: ScrapedJob;
      let jobLink: string;
      let agencyLink: string | null;
      try {
        if (info.site === "hireme") {
          if (browserError) throw new Error(browserError);
          try {
            browser ??= await openHiremeBrowser(browserProfileDir());
          } catch (err) {
            browserError = `HireMe browser: ${errorMessage(err)}`;
            throw new Error(browserError);
          }
          const result = await fetchHiremeJob(browser.page, siteJobId);
          job = result.job;
          hiremeReads++;
          if (result.loggedOut) loggedOutReads++;
          jobLink = job.employer_link;
          agencyLink = `https://hiremetech.com/job/${siteJobId}`;
        } else if (info.site === "linkedin") {
          job = await fetchLinkedinJob(siteJobId);
          jobLink = `https://www.linkedin.com/jobs/view/${siteJobId}`;
          agencyLink = null;
        } else {
          job = await fetchGenericJob(link, getAi);
          jobLink = link;
          agencyLink = null;
        }
      } catch (err) {
        if (err instanceof JobNotFoundError) report({ link, outcome: "not found" });
        else report({ link, outcome: "failed", detail: errorMessage(err) });
        continue;
      }

      // The employer's link may already be in the tracker (e.g. its LinkedIn post).
      const employerKey = jobLink ? linkInfo(jobLink).key : "";
      if (employerKey && employerKey !== info.key && known.has(employerKey)) {
        report({ link, outcome: "duplicate", detail: "same employer link as an existing job" });
        continue;
      }

      const record = jobRecord(jobIdFor(info), info, jobLink, agencyLink, job, today());
      const reposted = job.closed ? "" : repostOf(job, await descriptionsOf(job.title));
      const row = csvRow(record);
      if (reposted) row.filter = `rejected: repost of ${reposted}`;
      await saveJobJson(workspace, record);
      if (!(await options.saveRow(() => addJobs(csvPath, [row])))) {
        report({ link, outcome: "cancelled" });
        break;
      }
      known.add(info.key);
      if (employerKey) known.add(employerKey);
      earlier.push({ id: record.id, title: record.title, description: record.description });
      report({
        link,
        outcome: job.closed ? "closed" : reposted ? "repost" : "added",
        id: record.id,
        title: record.title,
        detail: reposted ? `same job as ${reposted}` : undefined,
      });
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS[info.site] ?? 1000));
    }
  } finally {
    await browser?.context.close();
  }

  return { results, loggedOut: hiremeReads > 0 && loggedOutReads === hiremeReads };
}

export function jobRecord(
  id: string,
  info: LinkInfo,
  jobLink: string,
  agencyLink: string | null,
  job: ScrapedJob,
  firstSeen: string,
): JobRecord {
  const { employer_link, ...details } = job;
  return {
    id,
    source: info.site,
    source_job_id: info.siteJobId ?? "",
    job_link: jobLink,
    agency_link: agencyLink,
    first_seen: firstSeen,
    ...details,
    requirements: null,
  };
}

// The tracker row for a new job; other columns start empty.
export function csvRow(record: JobRecord): JobRow {
  return {
    filter: record.closed ? "rejected: closed" : "",
    title: record.title,
    company: record.company,
    location: record.location,
    job_link: record.job_link,
    agency_link: record.agency_link ?? "",
    posted_date: record.posted_date,
    first_seen: record.first_seen,
    id: record.id,
    source_job_id: record.source_job_id,
  };
}

export function jobJsonPath(workspace: string, id: string): string {
  return path.join(workspace, "jobs", id, "job.json");
}

async function saveJobJson(workspace: string, record: JobRecord): Promise<void> {
  const file = jobJsonPath(workspace, record.id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record, null, 2) + "\n", "utf8");
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0];
}
