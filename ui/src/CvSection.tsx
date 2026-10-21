import { useEffect, useState } from "react";
import { buildCv, cvFileUrl, fetchCvReport, suggestCv, type CvReport, type JobRow } from "./api";

const MARK = { met: "✔", partly: "◐", not_met: "✘" } as const;
const CLASS = { met: "met", partly: "partly", not_met: "not-met" } as const;

// A job's CV: create or rebuild it (with optional instructions), and show its
// score, requirements checklist and what was adapted.
export function CvSection({ job, onChanged }: { job: JobRow; onChanged: () => void }) {
  const [report, setReport] = useState<CvReport | null | undefined>(undefined);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // Reload when the job, its CV choice or its CV status changes.
  useEffect(() => {
    setReport(undefined);
    setError("");
    fetchCvReport(job.id).then(setReport, (err) => setError(String(err)));
  }, [job.id, job.cv_choice, job.cv_status]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      onChanged();
    }
  }

  const build = () =>
    run("Building the CV with AI (up to a minute)...", async () => {
      setReport(await buildCv(job.id, instructions));
      setInstructions("");
    });

  const current = report && (report.choice === job.cv_choice || !job.cv_choice);
  return (
    <div className="card">
      <div className="controls" style={{ margin: 0 }}>
        <button className="primary" onClick={build} disabled={!!busy}>
          {current ? "Rebuild CV" : "Create CV"}
        </button>
        {!job.cv_choice && (
          <button onClick={() => run("Choosing a CV...", async () => void (await suggestCv(job.id)))} disabled={!!busy}>
            Suggest a CV choice
          </button>
        )}
        {current && (
          <a href={cvFileUrl(job.id)} target="_blank" rel="noreferrer">
            Open CV
          </a>
        )}
        <span className="hint">{busy}</span>
      </div>
      <input
        style={{ width: "100%", marginTop: 8 }}
        dir="auto"
        placeholder="Instructions for this CV (optional), e.g. emphasise the SQL work"
        value={instructions}
        disabled={!!busy}
        onChange={(e) => setInstructions(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      {job.cv_status?.startsWith("error") && !busy && <p className="error">Last build failed: {job.cv_status}</p>}
      {report === null && !busy && <p className="hint">No CV built for this job yet.</p>}
      {report && !current && <p className="hint">The CV choice changed since the last build: rebuild to use it.</p>}
      {report && current && (
        <>
          <p>
            <span className="score">Score {report.score}</span> must-haves met · {report.choice}
          </p>
          {report.note && <p dir="auto">{report.note}</p>}
          <ul className="checklist">
            {report.checklist.map((item) => (
              <li key={item.id} className={CLASS[item.status]} dir="auto">
                {MARK[item.status]} {item.id.startsWith("N") && <i>(nice) </i>}
                {item.requirement} <span className="hint">— {item.evidence}</span>
              </li>
            ))}
          </ul>
          {report.adapted.length > 0 && (
            <>
              <b>What was adapted</b>
              <ul>
                {report.adapted.map((line, i) => (
                  <li key={i} dir="auto">
                    {line}
                  </li>
                ))}
              </ul>
            </>
          )}
          {report.warnings.map((warning, i) => (
            <p key={i} className="error">
              {warning}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
