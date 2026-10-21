import { useEffect, useState } from "react";
import { AddJobs } from "./AddJobs";
import { fetchJobs, setSubmitted, updateJob, type JobRow } from "./api";
import { CvChoice } from "./CvChoice";
import type { CvEntry } from "./cvsApi";
import { Details } from "./Details";

const COLUMNS = [
  ["title", "Title"],
  ["company", "Company"],
  ["location", "Location"],
  ["score", "Score"],
  ["cv_status", "CV status"],
  ["filter", "Filter"],
  ["posted_date", "Posted"],
] as const;

type ColumnKey = (typeof COLUMNS)[number][0];

const isSubmitted = (job: JobRow) => (job.submitted ?? "").trim() !== "";
const isRejected = (job: JobRow) => (job.filter ?? "").trim() !== "";

export function JobsPage({ cvs, active }: { cvs: CvEntry[]; active: boolean }) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [search, setSearch] = useState("");
  const [notSubmittedOnly, setNotSubmittedOnly] = useState(false);
  const [hideRejected, setHideRejected] = useState(false);
  const [sort, setSort] = useState<{ key: ColumnKey; desc: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = () => fetchJobs().then(setJobs, (err) => setError(String(err)));
  // Reload whenever the page is shown: the Apply wizard may have changed jobs.
  useEffect(() => {
    if (active) reload();
  }, [active]);

  async function toggle(job: JobRow) {
    setError("");
    try {
      await setSubmitted(job.id, !isSubmitted(job));
      setJobs(await fetchJobs()); // reload: the CSV may also have changed in Excel
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function chooseCv(job: JobRow, choice: string) {
    setError("");
    try {
      await updateJob(job.id, { cv_choice: choice });
      setJobs(await fetchJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Click a header to sort by it; click again to reverse.
  function sortBy(key: ColumnKey) {
    setSort((current) => (current?.key === key ? { key, desc: !current.desc } : { key, desc: false }));
  }

  const query = search.trim().toLowerCase();
  const shown = jobs.filter(
    (job) =>
      (!notSubmittedOnly || !isSubmitted(job)) &&
      (!hideRejected || !isRejected(job)) &&
      (!query || COLUMNS.some(([key]) => (job[key] ?? "").toLowerCase().includes(query))),
  );
  if (sort) {
    const direction = sort.desc ? -1 : 1;
    shown.sort(
      (a, b) =>
        (a[sort.key] ?? "").localeCompare(b[sort.key] ?? "", undefined, { numeric: true }) * direction,
    );
  }

  const selected = jobs.find((job) => job.id === selectedId);

  return (
    <>
      <AddJobs onAdded={reload} />
      <div className="controls">
        <input
          type="search"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={notSubmittedOnly}
            onChange={(e) => setNotSubmittedOnly(e.target.checked)}
          />
          Not submitted
        </label>
        <label>
          <input
            type="checkbox"
            checked={hideRejected}
            onChange={(e) => setHideRejected(e.target.checked)}
          />
          Hide rejected
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="layout">
        <table>
          <thead>
            <tr>
              <th>Submitted</th>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className="sortable" onClick={() => sortBy(key)}>
                  {label}
                  {sort?.key === key ? (sort.desc ? " ▼" : " ▲") : ""}
                </th>
              ))}
              <th>Chosen CV</th>
              <th>Link 1</th>
              <th>Link 2</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((job) => (
              <tr
                key={job.id}
                className={job.id === selectedId ? "selected" : undefined}
                onClick={() => setSelectedId(job.id)}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isSubmitted(job)} onChange={() => toggle(job)} />
                </td>
                {COLUMNS.map(([key]) => (
                  <td key={key} dir="auto" className={key === "filter" ? "clip" : undefined} title={job[key]}>
                    {job[key]}
                  </td>
                ))}
                <td onClick={(e) => e.stopPropagation()}>
                  <CvChoice cvs={cvs} value={job.cv_choice ?? ""} onChange={(choice) => chooseCv(job, choice)} />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {job.job_link && <a href={job.job_link} target="_blank" rel="noreferrer">link 1</a>}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {job.agency_link && <a href={job.agency_link} target="_blank" rel="noreferrer">link 2</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {selected && <Details
              job={selected}
              cvs={cvs}
              onChooseCv={(choice) => chooseCv(selected, choice)}
              onClose={() => setSelectedId(null)}
              onChanged={reload}
            />}
      </div>
      <p>
        {shown.length} of {jobs.length} jobs
      </p>
    </>
  );
}
