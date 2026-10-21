import type { CvReport } from "../../src/cvTypes";

export type { CvReport };
export type JobRow = Record<string, string>;

// jobs/<id>/job.json, as the server sends it. `requirements` is filled by the AI step.
export interface JobDetails {
  id: string;
  title: string;
  company: string;
  location: string;
  posted_date: string;
  closed: boolean;
  employment_type: string;
  seniority: string;
  description: string;
  job_link: string;
  agency_link: string | null;
  requirements: {
    must_have?: { id: string; text: string }[];
    nice_to_have?: { id: string; text: string }[];
  } | null;
}

export type AddEvent =
  | { type: "start"; links: number; ignored: number }
  | { type: "result"; link: string; outcome: string; id?: string; title?: string; detail?: string }
  | { type: "done"; loggedOut: boolean }
  | { type: "error"; error: string };

export async function fetchJobs(): Promise<JobRow[]> {
  const response = await fetch("/api/jobs");
  if (!response.ok) throw new Error(`Loading jobs failed (HTTP ${response.status})`);
  return (await response.json()).rows;
}

export async function updateJob(
  id: string,
  changes: { submitted?: boolean; cv_choice?: string; note?: string },
): Promise<void> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!response.ok) throw new Error(await errorText(response));
}

export const setSubmitted = (id: string, submitted: boolean) => updateJob(id, { submitted });

// The job's saved details, or null if none were saved (e.g. jobs imported without them).
export async function fetchDetails(id: string): Promise<JobDetails | null> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/details`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

// Asks the server to extract this job's requirements with AI (takes up to a minute).
export async function extractRequirements(id: string): Promise<JobDetails["requirements"]> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/requirements`, { method: "POST" });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

// Apply wizard: copy the chosen CV into the job folder (answers with its full path),
// the same and show it selected in the file manager, or open the job's links.
export const prepareCv = (id: string) => postForPath(`/api/jobs/${encodeURIComponent(id)}/prepare-cv`);
export const showCv = (id: string) => postForPath(`/api/jobs/${encodeURIComponent(id)}/show-cv`);

export async function openLinks(id: string): Promise<void> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/open-links`, { method: "POST" });
  if (!response.ok) throw new Error(await errorText(response));
}

async function postForPath(url: string): Promise<string> {
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).path;
}

// --- CVs per job ---

// Builds (or rebuilds) the job's CV with AI; can take a minute.
export async function buildCv(id: string, instructions = ""): Promise<CvReport> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/build-cv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instructions }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export async function fetchCvReport(id: string): Promise<CvReport | null> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/cv-report`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

// Asks the AI which CV fits the job; saves and answers with the new cv_choice.
export async function suggestCv(id: string): Promise<string> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/suggest-cv`, { method: "POST" });
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).choice;
}

export const cvFileUrl = (id: string) => `/api/jobs/${encodeURIComponent(id)}/cv-file`;

export type BuildEvent =
  | { type: "start"; count: number }
  | { type: "result"; id: string; ok: boolean; score?: string; choice?: string; error?: string }
  | { type: "done" }
  | { type: "error"; error: string };

// Builds CVs for every job that needs one; calls onEvent as each one finishes.
export async function buildAll(onEvent: (event: BuildEvent) => void): Promise<void> {
  const response = await fetch("/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  await readLines(response, (line) => onEvent(JSON.parse(line)));
}

// Sends pasted text to the server and calls onEvent for each progress line it sends back.
export async function addJobs(text: string, onEvent: (event: AddEvent) => void): Promise<void> {
  const response = await fetch("/api/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  await readLines(response, (line) => onEvent(JSON.parse(line)));
}

// Reads a streamed answer that has one JSON object per line.
async function readLines(response: Response, onLine: (line: string) => void): Promise<void> {
  if (!response.ok || !response.body) throw new Error(await errorText(response));
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // a line may arrive in pieces; keep the unfinished part
    for (const line of lines) if (line.trim()) onLine(line);
  }
}

export async function errorText(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.error ?? `HTTP ${response.status}`;
}
