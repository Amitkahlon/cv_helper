import { useEffect, useState } from "react";
import { CvsPage } from "./Cvs";
import { fetchCvs, type CvEntry } from "./cvsApi";
import { JobsPage } from "./Jobs";
import { ProfilePage } from "./Profile";

const PAGES = { jobs: "Jobs", profile: "Profile", cvs: "CVs" } as const;
type Page = keyof typeof PAGES;

export function App() {
  const [page, setPage] = useState<Page>("jobs");
  const [cvs, setCvs] = useState<CvEntry[]>([]); // the CV library, shared by the pages

  useEffect(() => {
    fetchCvs().then(setCvs, () => {});
  }, []);

  // All pages stay mounted (just hidden), so switching keeps unsaved edits.
  return (
    <main>
      <nav>
        {(Object.keys(PAGES) as Page[]).map((key) => (
          <button key={key} className={key === page ? "current" : undefined} onClick={() => setPage(key)}>
            {PAGES[key]}
          </button>
        ))}
      </nav>
      <h1>{PAGES[page]}</h1>
      <div hidden={page !== "jobs"}>
        <JobsPage cvs={cvs} />
      </div>
      <div hidden={page !== "profile"}>
        <ProfilePage />
      </div>
      <div hidden={page !== "cvs"}>
        <CvsPage cvs={cvs} onChange={setCvs} />
      </div>
    </main>
  );
}
