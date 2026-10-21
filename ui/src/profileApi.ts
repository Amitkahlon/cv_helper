import type { Profile, ProfileData, ProfileQuestion, Role } from "../../src/profileTypes";
import { errorText } from "./api";

export type { Profile, ProfileData, ProfileQuestion, Role };

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

export async function askQuestions(profile: Profile, roles: Role[]): Promise<ProfileQuestion[]> {
  const response = await fetch("/api/profile/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, roles }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).questions;
}

// Uploads a predefined CV for a target role; answers with its path, e.g. "cvs/qa_cv.pdf".
export async function uploadRoleCv(file: File): Promise<string> {
  const response = await fetch(`/api/profile/cvs?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error(await errorText(response));
  return (await response.json()).file;
}
