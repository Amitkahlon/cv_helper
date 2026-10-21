import type { Profile, ProfileData, Role } from "../../src/profileTypes";
import { errorText } from "./api";

export type { Profile, ProfileData, Role };

export interface ProfileForm {
  profile: Profile;
  roles: Role[];
  rules: string;
}

export async function fetchProfile(): Promise<ProfileData> {
  const response = await fetch("/api/profile");
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

export async function saveProfile(form: ProfileForm): Promise<ProfileData> {
  const response = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

// Sends a CV file; answers with a draft profile to review (nothing is saved).
export async function importCv(file: File): Promise<Profile> {
  const response = await fetch(`/api/profile/import?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).draft;
}

// --- CV rules walkthrough ---

export type { CvRules } from "../../src/rulesText";
import type { CvRules } from "../../src/rulesText";

// The walkthrough's saved answers, or null before its first use.
export async function fetchRules(): Promise<CvRules | null> {
  const response = await fetch("/api/rules");
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).rules;
}

// Saves the answers and rules.md; skipKeywords are also added to the job filters.
export async function saveRules(rules: CvRules, skipKeywords: string[]): Promise<CvRules> {
  const response = await fetch("/api/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules, skip_keywords: skipKeywords }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).rules;
}

// A draft of the answers from existing rules text (nothing is saved).
export async function importRules(text: string): Promise<CvRules> {
  const response = await fetch("/api/rules/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).rules;
}
