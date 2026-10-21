import { useEffect, useState } from "react";
import { fetchDetails, type JobDetails, type JobRow } from "./api";

// The panel for one job: its saved job.json if there is one, otherwise the tracker row.
export function Details({ job, onClose }: { job: JobRow; onClose: () => void }) {
  const [details, setDetails] = useState<JobDetails | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    setDetails(undefined);
    setError("");
    fetchDetails(job.id).then(setDetails, (err) => setError(String(err)));
  }, [job.id]);

  const fact = (label: string, value: string | undefined) =>
    value ? (
      <p>
        <b>{label}:</b> <span dir="auto">{value}</span>
      </p>
    ) : null;

  return (
    <aside className="details">
      <button className="close" onClick={onClose}>
        Close
      </button>
      <h2 dir="auto">{job.title}</h2>
      {fact("Company", job.company)}
      {fact("Location", job.location)}
      {fact("Posted", job.posted_date)}
      {fact("First seen", job.first_seen)}
      {fact("Filter", job.filter)}
      {fact("CV", job.cv_status)}
      {details && fact("Employment type", details.employment_type)}
      {details && fact("Seniority", details.seniority)}
      {details?.closed && <p className="error">This job is closed.</p>}
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
        )}
      </p>

      {error && <p className="error">{error}</p>}
      {details === undefined && !error && <p>Loading...</p>}
      {details === null && <p>No details saved for this job.</p>}

      {details?.requirements?.must_have && (
        <>
          <h3>Must have</h3>
          <ul>
            {details.requirements.must_have.map((r) => (
              <li key={r.id} dir="auto">
                {r.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {details?.requirements?.nice_to_have && details.requirements.nice_to_have.length > 0 && (
        <>
          <h3>Nice to have</h3>
          <ul>
            {details.requirements.nice_to_have.map((r) => (
              <li key={r.id} dir="auto">
                {r.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {details?.description && (
        <>
          <h3>Description</h3>
          <div className="description" dir="auto">
            {details.description}
          </div>
        </>
      )}
    </aside>
  );
}
