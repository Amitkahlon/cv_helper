import { useEffect, useState } from "react";

// The jobs table's columns: every tracker column can be shown, in this order,
// plus any column the user added to the CSV themselves. Which ones are shown,
// and how wide they are, is remembered in the browser.

export interface ColumnDef {
  key: string; // the tracker column
  label: string;
  width: number; // default width in pixels
  kind?: "submitted" | "cv_choice" | "link"; // shown as a control instead of text
}

export const KNOWN_COLUMNS: ColumnDef[] = [
  { key: "submitted", label: "Submitted", width: 90, kind: "submitted" },
  { key: "title", label: "Title", width: 220 },
  { key: "company", label: "Company", width: 160 },
  { key: "location", label: "Location", width: 150 },
  { key: "first_seen", label: "Added", width: 100 },
  { key: "posted_date", label: "Posted", width: 100 },
  { key: "score", label: "Score", width: 70 },
  { key: "cv_status", label: "CV status", width: 100 },
  { key: "cv_choice", label: "Chosen CV", width: 180, kind: "cv_choice" },
  { key: "filter", label: "Filter", width: 160 },
  { key: "requirements", label: "Requirements", width: 260 },
  { key: "notes", label: "Notes", width: 200 },
  { key: "submitted_date", label: "Submitted on", width: 110 },
  { key: "phone_call_date", label: "Phone call", width: 110 },
  { key: "interview_date", label: "Interview", width: 110 },
  { key: "rejected_date", label: "Rejected", width: 110 },
  { key: "offer_date", label: "Offer", width: 110 },
  { key: "job_link", label: "Link 1", width: 70, kind: "link" },
  { key: "agency_link", label: "Link 2", width: 70, kind: "link" },
  { key: "cv_file", label: "CV file", width: 200 },
  { key: "id", label: "Id", width: 160 },
  { key: "source_job_id", label: "Site job id", width: 120 },
];

export const DEFAULT_VISIBLE = [
  "submitted", "title", "company", "location", "first_seen", "score", "cv_status", "cv_choice", "filter", "job_link", "agency_link",
];

// The known columns, then the user's own CSV columns (shown as plain text).
export function allColumns(csvColumns: string[]): ColumnDef[] {
  const known = new Set(KNOWN_COLUMNS.map((c) => c.key));
  const extra = csvColumns.filter((key) => key && !known.has(key)).map((key) => ({ key, label: key, width: 140 }));
  return [...KNOWN_COLUMNS, ...extra];
}

interface Prefs {
  visible: string[];
  widths: Record<string, number>;
}

const STORAGE_KEY = "cvhelper.jobs.columns";

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(saved?.visible)) return { visible: saved.visible.map(String), widths: saved.widths ?? {} };
  } catch {
    // no storage (private window) or a broken value: use the defaults
  }
  return { visible: DEFAULT_VISIBLE, widths: {} };
}

export const MIN_WIDTH = 48;

export function useColumnPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // can't remember them in this browser; they still apply until reload
    }
  }, [prefs]);

  return {
    isVisible: (key: string) => prefs.visible.includes(key),
    setVisible: (key: string, on: boolean) =>
      setPrefs((p) => ({ ...p, visible: on ? [...new Set([...p.visible, key])] : p.visible.filter((k) => k !== key) })),
    widthOf: (column: ColumnDef) => prefs.widths[column.key] ?? column.width,
    setWidth: (key: string, width: number) =>
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [key]: Math.max(MIN_WIDTH, Math.round(width)) } })),
    reset: () => setPrefs({ visible: DEFAULT_VISIBLE, widths: {} }),
  };
}

export type ColumnPrefs = ReturnType<typeof useColumnPrefs>;
