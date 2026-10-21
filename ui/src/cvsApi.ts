import type { CvEntry } from "../../src/profileTypes";
import { errorText } from "./api";

export type { CvEntry };

// The value a job's cv_choice column holds when it uses this library CV.
export const cvChoice = (file: string) => `predefined: ${file}`;

// Opens the CV file itself (PDFs show in the browser).
export const cvUrl = (file: string) => `/api/cvs/${encodeURIComponent(file)}`;

export async function fetchCvs(): Promise<CvEntry[]> {
  const response = await fetch("/api/cvs");
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export async function uploadCv(file: File): Promise<CvEntry> {
  const response = await fetch(`/api/cvs?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export async function saveCvs(cvs: CvEntry[]): Promise<CvEntry[]> {
  const response = await fetch("/api/cvs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cvs),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export async function deleteCv(file: string): Promise<void> {
  const response = await fetch(cvUrl(file), { method: "DELETE" });
  if (!response.ok) throw new Error(await errorText(response));
}
