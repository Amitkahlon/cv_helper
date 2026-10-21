import { useEffect, useState } from "react";
import {
  extractRequirements,
  fetchDetails,
  fetchJobs,
  openLinks,
  prepareCv,
  showCv,
  updateJob,
  type JobDetails,
  type JobRow,
} from "./api";
import { CvChoice } from "./CvChoice";
import { CvSection } from "./CvSection";
import { cvChoice, type CvEntry } from "./cvsApi";

const isSubmitted = (job: JobRow) => (job.submitted ?? "").trim() !== "";
const isRejected = (job: JobRow) => (job.filter ?? "").trim() !== "";

// Jobs worth applying to, newest first.
const toApply = (jobs: JobRow[]) =>
  jobs
    .filter((job) => !isSubmitted(job) && !isRejected(job))
    .sort((a, b) => (b.posted_date || b.first_seen || "").localeCompare(a.posted_date || a.first_seen || ""));

// The apply wizard: goes through the jobs not applied to yet, one at a time.
export function ApplyPage({ cvs, active }: { cvs: CvEntry[]; active: boolean }) {
  const [waiting, setWaiting] = useState<number | null>(null); // jobs to apply to, on the start screen
  const [queue, setQueue] = useState<JobRow[] | null>(null); // fixed when the wizard starts
  const [index, setIndex] = useState(0);
  const [autoLinks, setAutoLinks] = useState(true);
  const [autoFolder, setAutoFolder] = useState(true);
  const [details, setDetails] = useState<JobDetails | null | undefined>(undefined);
  const [cvPath, setCvPath] = useState("");
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState({ submitted: 0, skipped: 0 });
  const [round, setRound] = useState(0); // counts wizard starts, so restarting re-runs the arrival
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (active && !queue) fetchJobs().then((jobs) => setWaiting(toApply(jobs).length), () => {});
  }, [active, queue]);

  const job = queue && index < queue.length ? queue[index] : null;

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  // Copy the CV into the job folder, put its path on the clipboard, and (if
  // wanted) show it in the file manager. The clipboard comes first: the file
  // manager and browser windows take the focus, and the clipboard needs it.
  async function getCv(id: string, show: boolean) {
    const path = await prepareCv(id);
    setCvPath(path);
    const copied = await navigator.clipboard.writeText(path).then(() => true, () => false);
    setStatus(copied ? "CV path copied: paste it into the site's file picker." : "");
    if (show) await showCv(id);
  }

  // Runs on arriving at a job (not when the job's row changes, e.g. a CV is chosen).
  useEffect(() => {
    if (!job) return;
    setDetails(undefined);
    setCvPath("");
    setNote("");
    setStatus("");
    fetchDetails(job.id).then(setDetails, () => setDetails(null));
    run("Opening...", async () => {
      // A ready-made CV can be copied right away; a tailored one only once it's built.
      if (job.cv_choice?.startsWith("predefined:") || job.cv_status === "built") await getCv(job.id, autoFolder);
      if (autoLinks) await openLinks(job.id);
    });
  }, [job?.id, index, round]);

  const start = () =>
    run("Loading jobs...", async () => {
      setQueue(toApply(await fetchJobs()));
      setIndex(0);
      setRound((r) => r + 1);
      setCounts({ submitted: 0, skipped: 0 });
    });

  const next = () => setIndex((i) => i + 1);

  const submitted = (current: JobRow) =>
    run("Saving...", async () => {
      await updateJob(current.id, { submitted: true, note });
      setCounts((c) => ({ ...c, submitted: c.submitted + 1 }));
      next();
    });

  const skip = (current: JobRow) =>
    run("Saving...", async () => {
      if (note.trim()) await updateJob(current.id, { note });
      setCounts((c) => ({ ...c, skipped: c.skipped + 1 }));
      next();
    });

  const chooseCv = (current: JobRow, choice: string) =>
    run("Saving...", async () => {
      await updateJob(current.id, { cv_choice: choice });
      setQueue((q) => q!.map((j) => (j.id === current.id ? { ...j, cv_choice: choice } : j)));
      setCvPath("");
      if (choice.startsWith("predefined:")) await getCv(current.id, autoFolder);
    });

  // After a CV is built or the choice changes: refresh this job's row and get the new CV ready.
  const refreshJob = (current: JobRow) =>
    run("Updating...", async () => {
      const fresh = (await fetchJobs()).find((j) => j.id === current.id);
      if (!fresh) return;
      setQueue((q) => q!.map((j) => (j.id === fresh.id ? fresh : j)));
      if (fresh.cv_status === "built") await getCv(fresh.id, false);
    });

  const extract = (current: JobRow) =>
    run("Reading requirements with AI...", async () => {
      const requirements = await extractRequirements(current.id);
      setDetails((d) => (d ? { ...d, requirements } : d));
    });

  // --- Start screen ---
  if (!queue) {
    return (
      <div className="page">
        <p>
          {waiting === null ? "Counting jobs..." : `${waiting} job(s) not submitted and not rejected, newest first.`}
        </p>
        <p>For each job the wizard copies your chosen CV into the job's folder and puts its path on the clipboard.</p>
        <label>
          <input type="checkbox" checked={autoLinks} onChange={(e) => setAutoLinks(e.target.checked)} /> Open the
          job's links in the browser automatically
        </label>
        <br />
        <label>
          <input type="checkbox" checked={autoFolder} onChange={(e) => setAutoFolder(e.target.checked)} /> Show the CV
          in its folder automatically (selected, ready to drag)
        </label>
        <p>
          <button className="primary" onClick={start} disabled={!!busy || waiting === 0}>
            Start
          </button>
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  // --- Finished ---
  if (!job) {
    return (
      <div className="page">
        <p>
          Done: {counts.submitted} submitted, {counts.skipped} skipped.
        </p>
        <button onClick={() => setQueue(null)}>Back to start</button>
      </div>
    );
  }

  // --- One job ---
  const chosen = cvs.find((cv) => cvChoice(cv.file) === job.cv_choice);
  const requirements = details?.requirements;
  return (
    <div className="page">
      <div className="toolbar">
        <b>
          Job {index + 1} of {queue.length}
        </b>
        <button className="primary" onClick={() => submitted(job)} disabled={!!busy}>
          Submitted → next
        </button>
        <button onClick={() => skip(job)} disabled={!!busy}>
          Skip → next
        </button>
        <button onClick={() => setIndex((i) => i - 1)} disabled={!!busy || index === 0}>
          Back
        </button>
        <button onClick={() => setQueue(null)} disabled={!!busy}>
          Stop
        </button>
        <span>{busy || status}</span>
      </div>
      {error && <p className="error">{error}</p>}

      <h2 dir="auto">{job.title}</h2>
      <p dir="auto">{[job.company, job.location, job.posted_date && `posted ${job.posted_date}`].filter(Boolean).join(" · ")}</p>
      <p>
        {job.job_link && (
          <a href={job.job_link} target="_blank" rel="noreferrer">
            Link 1
          </a>
        )}{" "}
        {job.agency_link && (
          <a href={job.agency_link} target="_blank" rel="noreferrer">
            Link 2
          </a>
        )}{" "}
        <button onClick={() => run("Opening...", () => openLinks(job.id))} disabled={!!busy}>
          Open links again
        </button>
      </p>

      <h3>CV</h3>
      <p>
        <CvChoice cvs={cvs} value={job.cv_choice ?? ""} onChange={(choice) => chooseCv(job, choice)} />{" "}
        {chosen?.purpose && <span className="hint">For: {chosen.purpose}</span>}
      </p>
      <CvSection job={job} onChanged={() => refreshJob(job)} />
      {cvPath && (
        <p>
          <code>{cvPath}</code>{" "}
          <button onClick={() => run("Copying...", () => getCv(job.id, false))} disabled={!!busy}>
            Copy path
          </button>{" "}
          <button onClick={() => run("Opening folder...", async () => void (await showCv(job.id)))} disabled={!!busy}>
            Show in folder
          </button>
        </p>
      )}

      <h3>Requirements</h3>
      {details === undefined && <p>Loading...</p>}
      {details === null && <p>No details saved for this job.</p>}
      {details && !requirements && (
        <button onClick={() => extract(job)} disabled={!!busy}>
          Extract requirements (AI)
        </button>
      )}
      {requirements?.must_have && (
        <ul>
          {requirements.must_have.map((r) => (
            <li key={r.id} dir="auto">
              {r.text}
            </li>
          ))}
        </ul>
      )}
      {requirements?.nice_to_have && requirements.nice_to_have.length > 0 && (
        <>
          <p>Nice to have:</p>
          <ul>
            {requirements.nice_to_have.map((r) => (
              <li key={r.id} dir="auto">
                {r.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {details?.description && (
        <details>
          <summary>Description</summary>
          <div className="description" dir="auto">
            {details.description}
          </div>
        </details>
      )}

      <label className="field">
        <span>Note (optional, saved to the job's notes when you move on)</span>
        <textarea dir="auto" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </div>
  );
}
