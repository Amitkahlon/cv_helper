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

export async function setSubmitted(id: string, submitted: boolean): Promise<void> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submitted }),
  });
  if (!response.ok) throw new Error(await errorText(response));
}

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

// Sends pasted text to the server and calls onEvent for each progress line it sends back.
export async function addJobs(text: string, onEvent: (event: AddEvent) => void): Promise<void> {
  const response = await fetch("/api/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok || !response.body) throw new Error(await errorText(response));

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // a line may arrive in pieces; keep the unfinished part
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
  }
}

export async function errorText(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.error ?? `HTTP ${response.status}`;
}
