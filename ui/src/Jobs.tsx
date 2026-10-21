import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AddJobs } from "./AddJobs";
import { fetchJobTable, setSubmitted, updateJob, type JobRow } from "./api";
import { ColumnChooser } from "./ColumnChooser";
import { CvChoice } from "./CvChoice";
import type { CvEntry } from "./cvsApi";
import { Details } from "./Details";
import { GettingStarted } from "./GettingStarted";
import { allColumns, useColumnPrefs, type ColumnDef } from "./jobColumns";
import { SelectionBar } from "./SelectionBar";
import { useSelection } from "./selection";

const isSubmitted = (job: JobRow) => (job.submitted ?? "").trim() !== "";
const isRejected = (job: JobRow) => (job.filter ?? "").trim() !== "";
const hasCv = (job: JobRow) => job.cv_status === "built";

const SELECT_WIDTH = 36;

type Sort = { key: string; desc: boolean };
const DEFAULT_SORT: Sort = { key: "first_seen", desc: true }; // newest added first

export function JobsPage({ cvs, active, goTo }: { cvs: CvEntry[]; active: boolean; goTo: (page: "profile" | "apply") => void }) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [notSubmittedOnly, setNotSubmittedOnly] = useState(false);
  const [hideRejected, setHideRejected] = useState(false);
  const [noCvOnly, setNoCvOnly] = useState(false);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [openId, setOpenId] = useState<string | null>(null); // the job shown in the details panel
  const [error, setError] = useState("");
  const prefs = useColumnPrefs();

  const reload = () =>
    fetchJobTable().then(
      (table) => {
        setJobs(table.rows);
        setCsvColumns(table.columns);
      },
      (err) => setError(String(err)),
    );
  // Reload whenever the page is shown: the Apply wizard may have changed jobs.
  useEffect(() => {
    if (active) reload();
  }, [active]);

  async function change(action: () => Promise<void>) {
    setError("");
    try {
      await action();
      await reload(); // the CSV may also have changed in Excel
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  const toggleSubmitted = (job: JobRow) => change(() => setSubmitted(job.id, !isSubmitted(job)));
  const chooseCv = (job: JobRow, choice: string) => change(() => updateJob(job.id, { cv_choice: choice }));

  const columns = useMemo(() => allColumns(csvColumns), [csvColumns]);
  const visible = columns.filter((c) => prefs.isVisible(c.key));

  // Click a header to sort by it; click again to reverse.
  const sortBy = (key: string) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }));

  const query = search.trim().toLowerCase();
  const shown = useMemo(() => {
    // Rows keep their place in the file as a tie-breaker: later rows were added later.
    const list = jobs
      .map((job, index) => ({ job, index }))
      .filter(
        ({ job }) =>
          (!notSubmittedOnly || !isSubmitted(job)) &&
          (!hideRejected || !isRejected(job)) &&
          (!noCvOnly || !hasCv(job)) &&
          (!query || ["title", "company", "location", "notes", "requirements", "filter"].some((key) => (job[key] ?? "").toLowerCase().includes(query))),
      );
    const direction = sort.desc ? -1 : 1;
    list.sort(
      (a, b) =>
        ((a.job[sort.key] ?? "").localeCompare(b.job[sort.key] ?? "", undefined, { numeric: true }) || a.index - b.index) * direction,
    );
    return list.map(({ job }) => job);
  }, [jobs, notSubmittedOnly, hideRejected, noCvOnly, query, sort]);

  const allIds = useMemo(() => jobs.map((job) => job.id).filter(Boolean), [jobs]);
  const shownIds = useMemo(() => shown.map((job) => job.id).filter(Boolean), [shown]);
  const selection = useSelection(allIds, shownIds);
  const titleOf = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    return job ? `${job.title}${job.company ? ` (${job.company})` : ""}` : id;
  };

  // Escape closes the details panel.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  // The header checkbox shows "some selected" as a dash.
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = selection.shownState === "some";
  }, [selection.shownState]);

  // Drag a header's right edge to resize its column.
  function startResize(event: ReactPointerEvent, column: ColumnDef) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = prefs.widthOf(column);
    const move = (e: PointerEvent) => prefs.setWidth(column.key, startWidth + e.clientX - startX);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    document.body.classList.add("resizing");
  }

  function cell(job: JobRow, column: ColumnDef) {
    const value = job[column.key] ?? "";
    switch (column.kind) {
      case "submitted":
        return (
          <label className="sent" title={isSubmitted(job) ? `Submitted ${job.submitted_date ?? ""}` : "Mark as submitted"}>
            <input type="checkbox" aria-label="Submitted" checked={isSubmitted(job)} onChange={() => toggleSubmitted(job)} />
          </label>
        );
      case "cv_choice":
        return <CvChoice cvs={cvs} value={value} onChange={(choice) => chooseCv(job, choice)} />;
      case "link":
        return value && /^(https?:|mailto:)/.test(value) ? (
          <a href={value} target="_blank" rel="noreferrer">
            {column.label.toLowerCase()}
          </a>
        ) : null;
      default:
        return formatted(column.key, value);
    }
  }

  // Statuses as small coloured labels, so they can be read at a glance.
  function formatted(key: string, value: string) {
    if (!value) return null;
    if (key === "cv_status") {
      if (value === "built") return <span className="chip ok">CV ready</span>;
      if (value.startsWith("error")) return <span className="chip bad" title={value}>CV error</span>;
    }
    if (key === "score") {
      const [met, total] = value.split("/").map(Number);
      const ratio = total ? met / total : 0;
      return <span className={`chip ${ratio >= 0.75 ? "ok" : ratio >= 0.5 ? "warn" : "bad"}`}>{value}</span>;
    }
    if (key === "filter") return <span className="chip muted">{value.replace(/^rejected:\s*/, "")}</span>;
    return value;
  }

  const tableWidth = SELECT_WIDTH + visible.reduce((sum, c) => sum + prefs.widthOf(c), 0);
  const opened = jobs.find((job) => job.id === openId);

  return (
    <>
      <GettingStarted jobs={jobs} goTo={goTo} />
      <AddJobs onAdded={reload} startOpen={jobs.length === 0} />
      <div className="controls">
        <input type="search" placeholder="Search title, company, notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <span className="spacer" />
        <ColumnChooser columns={columns} prefs={prefs} />
      </div>
      <SelectionBar selection={selection} shownCount={shownIds.length} cvs={cvs} labelOf={titleOf} onChanged={reload} />
      {error && <p className="error">{error}</p>}
      <div className="layout">
        <div className="table-wrap">
          <table className="jobs" style={{ width: tableWidth }}>
            <colgroup>
              <col style={{ width: SELECT_WIDTH }} />
              {visible.map((c) => (
                <col key={c.key} style={{ width: prefs.widthOf(c) }} />
              ))}
            </colgroup>
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
                {visible.map((c) => (
                  <th key={c.key} className={c.kind ? undefined : "sortable"} onClick={() => !c.kind && sortBy(c.key)}>
                    <span className="th-label">
                      {c.label}
                      {sort.key === c.key ? (sort.desc ? " ▼" : " ▲") : ""}
                    </span>
                    <span
                      className="resizer"
                      title="Drag to resize"
                      onPointerDown={(e) => startResize(e, c)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        prefs.setWidth(c.key, c.width); // double-click: back to the default width
                      }}
                    />
                  </th>
                ))}
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
                  {visible.map((c) => (
                    <td key={c.key} dir="auto" title={c.kind ? undefined : job[c.key]} onClick={c.kind ? (e) => e.stopPropagation() : undefined}>
                      {cell(job, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="empty">
              {jobs.length === 0 ? "No jobs yet: paste links or WhatsApp messages in Add jobs above." : "No jobs match the search and filters."}
            </p>
          )}
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
