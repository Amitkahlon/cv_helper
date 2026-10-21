import { useEffect, useState } from "react";
import { fetchJobs, setSubmitted, type JobRow } from "./api";

const COLUMNS = [
  ["title", "Title"],
  ["company", "Company"],
  ["location", "Location"],
  ["score", "Score"],
  ["filter", "Filter"],
  ["posted_date", "Posted"],
] as const;

const isSubmitted = (job: JobRow) => (job.submitted ?? "").trim() !== "";

export function App() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJobs().then(setJobs, (err) => setError(String(err)));
  }, []);

  async function toggle(job: JobRow) {
    setError("");
    try {
      await setSubmitted(job.id, !isSubmitted(job));
      setJobs(await fetchJobs()); // reload: the CSV may also have changed in Excel
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const query = search.trim().toLowerCase();
  const shown = jobs.filter(
    (job) => !query || COLUMNS.some(([key]) => (job[key] ?? "").toLowerCase().includes(query)),
  );

  return (
    <main>
      <h1>Jobs</h1>
      <input
        type="search"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Submitted</th>
            {COLUMNS.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((job) => {
            const link = job.job_link || job.agency_link;
            return (
              <tr key={job.id}>
                <td>
                  <input type="checkbox" checked={isSubmitted(job)} onChange={() => toggle(job)} />
                </td>
                {COLUMNS.map(([key]) => (
                  <td key={key} dir="auto">
                    {job[key]}
                  </td>
                ))}
                <td>{link && <a href={link} target="_blank" rel="noreferrer">open</a>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        {shown.length} of {jobs.length} jobs
      </p>
    </main>
  );
}
