import { useState } from "react";
import { JobsPage } from "./Jobs";
import { ProfilePage } from "./Profile";

const PAGES = { jobs: "Jobs", profile: "Profile" } as const;
type Page = keyof typeof PAGES;

export function App() {
  const [page, setPage] = useState<Page>("jobs");

  // Both pages stay mounted (just hidden), so switching keeps unsaved edits.
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
        <JobsPage />
      </div>
      <div hidden={page !== "profile"}>
        <ProfilePage />
      </div>
    </main>
  );
}
