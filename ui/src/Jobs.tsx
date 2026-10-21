import { useEffect, useMemo, useRef, useState } from "react";
import { AddJobs } from "./AddJobs";
import { fetchJobs, setSubmitted, updateJob, type JobRow } from "./api";
import { CvChoice } from "./CvChoice";
import type { CvEntry } from "./cvsApi";
import { Details } from "./Details";
import { SelectionBar } from "./SelectionBar";
import { useSelection } from "./selection";

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
const hasCv = (job: JobRow) => job.cv_status === "built";

export function JobsPage({ cvs, active }: { cvs: CvEntry[]; active: boolean }) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [search, setSearch] = useState("");
  const [notSubmittedOnly, setNotSubmittedOnly] = useState(false);
  const [hideRejected, setHideRejected] = useState(false);
  const [noCvOnly, setNoCvOnly] = useState(false);
  const [sort, setSort] = useState<{ key: ColumnKey; desc: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // the job shown in the details panel
  const [error, setError] = useState("");

  const reload = () => fetchJobs().then(setJobs, (err) => setError(String(err)));
  // Reload whenever the page is shown: the Apply wizard may have changed jobs.
  useEffect(() => {
    if (active) reload();
  }, [active]);

  async function change(job: JobRow, action: () => Promise<void>) {
    setError("");
    try {
      await action();
      setJobs(await fetchJobs()); // reload: the CSV may also have changed in Excel
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  const toggleSubmitted = (job: JobRow) => change(job, () => setSubmitted(job.id, !isSubmitted(job)));
  const chooseCv = (job: JobRow, choice: string) => change(job, () => updateJob(job.id, { cv_choice: choice }));

  // Click a header to sort by it; click again to reverse.
  function sortBy(key: ColumnKey) {
    setSort((current) => (current?.key === key ? { key, desc: !current.desc } : { key, desc: false }));
  }

  const query = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = jobs.filter(
      (job) =>
        (!notSubmittedOnly || !isSubmitted(job)) &&
        (!hideRejected || !isRejected(job)) &&
        (!noCvOnly || !hasCv(job)) &&
        (!query || COLUMNS.some(([key]) => (job[key] ?? "").toLowerCase().includes(query))),
    );
    if (sort) {
      const direction = sort.desc ? -1 : 1;
      list.sort((a, b) => (a[sort.key] ?? "").localeCompare(b[sort.key] ?? "", undefined, { numeric: true }) * direction);
    }
    return list;
  }, [jobs, notSubmittedOnly, hideRejected, noCvOnly, query, sort]);

  const allIds = useMemo(() => jobs.map((job) => job.id).filter(Boolean), [jobs]);
  const shownIds = useMemo(() => shown.map((job) => job.id).filter(Boolean), [shown]);
  const selection = useSelection(allIds, shownIds);
  const titleOf = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    return job ? `${job.title}${job.company ? ` (${job.company})` : ""}` : id;
  };

  // The header checkbox shows "some selected" as a dash.
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = selection.shownState === "some";
  }, [selection.shownState]);

  const opened = jobs.find((job) => job.id === openId);

  return (
    <>
      <AddJobs onAdded={reload} />
      <div className="controls">
        <input type="search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label>
          <input type="checkbox" checked={notSubmittedOnly} onChange={(e) => setNotSubmittedOnly(e.target.checked)} /> Not
          submitted
        </label>
        <label>
          <input type="checkbox" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} /> Hide
          rejected
        </label>
        <label>
          <input type="checkbox" checked={noCvOnly} onChange={(e) => setNoCvOnly(e.target.checked)} /> No CV yet
        </label>
      </div>
      <SelectionBar selection={selection} shownCount={shownIds.length} cvs={cvs} labelOf={titleOf} onChanged={reload} />
      {error && <p className="error">{error}</p>}
      <div className="layout">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="select-cell" title="Select all shown (Shift-click a row's box to select a range)">
                  <input
                    ref={headerBox}
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={selection.shownState === "all" && shownIds.length > 0}
                    onChange={() => selection.selectShown(selection.shownState !== "all")}
                  />
                </th>
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
                  className={[job.id === openId && "opened", selection.isSelected(job.id) && "checked"].filter(Boolean).join(" ") || undefined}
                  onClick={() => setOpenId(job.id)}
                >
                  <td className="select-cell" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${job.title}`}
                      checked={selection.isSelected(job.id)}
                      readOnly
                      onClick={(e) => selection.toggle(job.id, e.shiftKey)}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Submitted" checked={isSubmitted(job)} onChange={() => toggleSubmitted(job)} />
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
                    {job.job_link && (
                      <a href={job.job_link} target="_blank" rel="noreferrer">
                        link 1
                      </a>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {job.agency_link && (
                      <a href={job.agency_link} target="_blank" rel="noreferrer">
                        link 2
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {opened && (
          <Details
            job={opened}
            cvs={cvs}
            onChooseCv={(choice) => chooseCv(opened, choice)}
            onClose={() => setOpenId(null)}
            onChanged={reload}
          />
        )}
      </div>
      <p className="count">
        {shown.length} of {jobs.length} jobs
      </p>
    </>
  );
}
