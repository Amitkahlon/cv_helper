import { useEffect, useState } from "react";
import { fetchJobs, type JobRow } from "./api";

// Statistics from the tracker's date columns (plan section 4): how many
// applications get answers, how fast, and which sources respond best.

const has = (job: JobRow, column: string) => (job[column] ?? "").trim() !== "";
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;
const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "—");
const source = (job: JobRow) => (job.agency_link?.includes("hiremetech") ? "HireMe" : job.id?.startsWith("linkedin-") ? "LinkedIn" : "Other sites");

export function StatsPage({ active }: { active: boolean }) {
  const [jobs, setJobs] = useState<JobRow[]>([]);

  useEffect(() => {
    if (active) fetchJobs().then(setJobs, () => {});
  }, [active]);

  const submitted = jobs.filter((job) => has(job, "submitted"));
  const answered = submitted.filter((job) => has(job, "phone_call_date") || has(job, "interview_date"));
  const interviews = submitted.filter((job) => has(job, "interview_date"));
  const offers = submitted.filter((job) => has(job, "offer_date"));
  const rejected = submitted.filter((job) => has(job, "rejected_date"));
  const waits = submitted
    .filter((job) => has(job, "submitted_date") && has(job, "phone_call_date"))
    .map((job) => days(job.submitted_date, job.phone_call_date))
    .filter((d) => !isNaN(d) && d >= 0);
  const averageWait = waits.length ? (waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1) : "—";

  // Applications per month, from submitted_date.
  const months = new Map<string, number>();
  for (const job of submitted) {
    const month = (job.submitted_date ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) months.set(month, (months.get(month) ?? 0) + 1);
  }
  const monthRows = [...months].sort(([a], [b]) => a.localeCompare(b));
  const busiest = Math.max(1, ...monthRows.map(([, n]) => n));

  const sources = ["HireMe", "LinkedIn", "Other sites"].map((name) => {
    const sent = submitted.filter((job) => source(job) === name);
    const replies = sent.filter((job) => has(job, "phone_call_date") || has(job, "interview_date"));
    return { name, total: jobs.filter((job) => source(job) === name).length, sent: sent.length, replies: replies.length };
  });

  const stat = (label: string, value: string | number, note = "") => (
    <div className="stat">
      <b>{value}</b>
      {label}
      {note && <div className="hint">{note}</div>}
    </div>
  );

  return (
    <div className="page">
      <div className="stats">
        {stat("jobs in the tracker", jobs.length)}
        {stat("submitted", submitted.length)}
        {stat("got a call or interview", answered.length, `${percent(answered.length, submitted.length)} of submitted`)}
        {stat("interviews", interviews.length)}
        {stat("offers", offers.length)}
        {stat("rejections", rejected.length)}
        {stat("days to first call", averageWait, waits.length ? `average of ${waits.length}` : "needs submitted and call dates")}
      </div>

      <h2>By source</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Jobs</th>
              <th>Submitted</th>
              <th>Calls or interviews</th>
              <th>Response rate</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.total}</td>
                <td>{s.sent}</td>
                <td>{s.replies}</td>
                <td>{percent(s.replies, s.sent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Applications per month</h2>
      {monthRows.length === 0 && <p className="hint">No submitted dates yet.</p>}
      {monthRows.map(([month, count]) => (
        <div key={month} style={{ display: "grid", gridTemplateColumns: "80px 1fr 40px", gap: 8, alignItems: "center", margin: "4px 0" }}>
          <span>{month}</span>
          <div className="bar">
            <div style={{ width: `${(100 * count) / busiest}%` }} />
          </div>
          <span>{count}</span>
        </div>
      ))}
      <p className="hint">
        Calls, interviews, rejections and offers come from their date columns: fill them in the job's details panel or
        in the CSV.
      </p>
    </div>
  );
}
