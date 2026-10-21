export type JobRow = Record<string, string>;

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
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
}
