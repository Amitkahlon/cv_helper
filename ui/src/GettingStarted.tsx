import { useEffect, useState } from "react";
import type { JobRow } from "./api";
import { fetchProfile } from "./profileApi";

const DISMISSED_KEY = "cvhelper.gettingStarted.dismissed";

// The first steps, ticked off as they're done, with links to where each happens.
// Hidden once everything is done, or when dismissed.
export function GettingStarted({ jobs, goTo }: { jobs: JobRow[]; goTo: (page: "profile" | "apply") => void }) {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    fetchProfile().then((data) => setHasProfile(data.exists && !!data.profile.personal.name), () => setHasProfile(null));
  }, [jobs.length]);

  const steps = [
    { done: !!hasProfile, text: "Set up your profile and CV rules", action: () => goTo("profile"), cta: "Open Profile" },
    { done: jobs.length > 0, text: "Add jobs: paste links or WhatsApp messages in Add jobs below" },
    { done: jobs.some((job) => job.cv_status === "built"), text: "Create CVs: select jobs in the table, then Create CVs" },
    { done: jobs.some((job) => (job.submitted ?? "").trim()), text: "Apply: the Apply tab walks you through each job", action: () => goTo("apply"), cta: "Open Apply" },
  ];
  if (dismissed || hasProfile === null || steps.every((s) => s.done)) return null;

  return (
    <div className="card getting-started">
      <div className="popover-head">
        <b>Getting started</b>
        <button
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              // fine: it just shows again next time
            }
          }}
        >
          Hide
        </button>
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step.text} className={step.done ? "done" : undefined}>
            <span className="check">{step.done ? "✓" : ""}</span>
            {step.text}
            {!step.done && step.action && (
              <button className="link" onClick={step.action}>
                {step.cta}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
