import { cvChoice, type CvEntry } from "./cvsApi";

// What can be done to the selected rows. Each entry is one action; its `id` is
// the server's action name (src/bulk.ts). To add an action, add an entry here
// and one there: the selection bar shows it, asks for its inputs and runs it.

export interface ActionContext {
  cvs: CvEntry[];
  roles: string[];
}

export interface ParamField {
  key: string;
  label: string;
  kind: "text" | "select";
  options?: (context: ActionContext) => { value: string; label: string; group?: string }[];
}

export interface BulkActionDef {
  id: string;
  label: string;
  hint?: string; // shown with the action's inputs
  params?: ParamField[];
  confirm?: (count: number) => string; // asked before running
  danger?: boolean;
}

// The CV options for a job: tailored for a role, or a library CV.
const cvOptions = (context: ActionContext) => [
  { value: "tailored:", label: "Tailored (no role)", group: "Tailored from your profile" },
  ...context.roles.map((role) => ({ value: `tailored: ${role}`, label: `Tailored: ${role}`, group: "Tailored from your profile" })),
  ...[...context.cvs]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((cv) => ({ value: cvChoice(cv.file), label: cv.name, group: cv.category || "Ready-made" })),
];

export const BULK_ACTIONS: BulkActionDef[] = [
  {
    id: "build-cv",
    label: "Create CVs",
    hint: "Builds a CV for each selected job with AI (about half a minute each) and scores it against the job.",
    params: [
      {
        key: "choice",
        label: "CV to use",
        kind: "select",
        options: (context) => [{ value: "", label: "Each job's own choice (AI picks if none)" }, ...cvOptions(context)],
      },
      { key: "instructions", label: "Instructions for tailored CVs (optional)", kind: "text" },
    ],
  },
  { id: "submit", label: "Mark submitted" },
  { id: "unsubmit", label: "Mark not submitted" },
  { id: "skip", label: "Skip", hint: "Hides the jobs (filter: rejected: skipped). Restore brings them back." },
  { id: "restore", label: "Restore", hint: "Clears the filter column, so rejected or skipped jobs show again." },
  {
    id: "set-choice",
    label: "Set CV choice",
    params: [
      {
        key: "choice",
        label: "CV to use",
        kind: "select",
        options: (context) => [{ value: "", label: "— none —" }, ...cvOptions(context)],
      },
    ],
  },
  { id: "suggest-cv", label: "Suggest CV choice", hint: "The AI picks a CV for each job (and reads its requirements if needed)." },
  { id: "requirements", label: "Extract requirements", hint: "Reads each job's requirements with AI; filters are applied after." },
  {
    id: "delete",
    label: "Delete",
    danger: true,
    confirm: (count) =>
      `Delete ${count} job(s) from the tracker, with their saved details and CVs? This can't be undone. ` +
      "Adding the same link again later adds it as a new job.",
  },
];
