import { useEffect, useState } from "react";
import { ApplyPage } from "./Apply";
import { CvsPage } from "./Cvs";
import { fetchCvs, type CvEntry } from "./cvsApi";
import { JobsPage } from "./Jobs";
import { ProfilePage } from "./Profile";
import { SettingsPage } from "./Settings";

const PAGES = { jobs: "Jobs", apply: "Apply", profile: "Profile", cvs: "CVs", settings: "Settings" } as const;
type Page = keyof typeof PAGES;

export function App() {
  const [page, setPage] = useState<Page>("jobs");
  const [cvs, setCvs] = useState<CvEntry[]>([]); // the CV library, shared by the pages

  useEffect(() => {
    fetchCvs().then(setCvs, () => {});
  }, []);

  // All pages stay mounted (just hidden), so switching keeps unsaved edits.
  return (
    <>
      <header className="app-header">
        <div className="brand">
          cv<span>helper</span>
        </div>
        <nav className="tabs">
          {(Object.keys(PAGES) as Page[]).map((key) => (
            <button key={key} className={key === page ? "current" : undefined} onClick={() => setPage(key)}>
              {PAGES[key]}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        <div hidden={page !== "jobs"}>
          <JobsPage cvs={cvs} active={page === "jobs"} />
        </div>
        <div hidden={page !== "apply"}>
          <ApplyPage cvs={cvs} active={page === "apply"} />
        </div>
        <div hidden={page !== "profile"}>
          <ProfilePage />
        </div>
        <div hidden={page !== "cvs"}>
          <CvsPage cvs={cvs} onChange={setCvs} />
        </div>
        <div hidden={page !== "settings"}>
          <SettingsPage />
        </div>
      </main>
    </>
  );
}
