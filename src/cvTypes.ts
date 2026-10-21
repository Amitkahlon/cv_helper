// Types shared with the UI (no imports with runtime code, so the page can use them).

export interface ChecklistItem {
  id: string; // R1.. must-have, N1.. nice-to-have
  requirement: string;
  status: "met" | "partly" | "not_met";
  evidence: string; // the profile fact that covers it, or what is missing
}

// Saved as jobs/<id>/cv.json; the UI and the apply wizard show it.
export interface CvReport {
  choice: string;
  file: string; // relative to the workspace
  built_at: string;
  note: string; // one line: what this CV leads with
  adapted: string[]; // what was changed for this job
  checklist: ChecklistItem[];
  score: string; // met must-haves / all must-haves, e.g. "3/5"
  warnings: string[];
  instructions?: string; // the user's extra instructions for this build
  content?: unknown; // tailored CVs only: what the AI chose (TailoredContent)
}
