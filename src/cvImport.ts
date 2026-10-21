import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { AiProvider } from "./ai/provider.js";
import { arrayOf, object, STRING, STRINGS } from "./ai/schema.js";
import { cleanProfile, profileDir } from "./profile.js";
import type { Profile } from "./profileTypes.js";

const ENTRY = object({
  role: STRING, organization: STRING, start: STRING, end: STRING, location: STRING,
  facts: STRINGS, skills: STRINGS,
});

export const PROFILE_SCHEMA = object({
  personal: object({ name: STRING, email: STRING, phone: STRING, city: STRING, links: STRINGS, summary: STRING }),
  experience: arrayOf(ENTRY),
  projects: arrayOf(object({ name: STRING, link: STRING, description: STRING, skills: STRINGS })),
  education: arrayOf(
    object({ degree: STRING, institution: STRING, start: STRING, end: STRING, grade: STRING, notable_courses: STRINGS }),
  ),
  skills: arrayOf(object({ group: STRING, items: STRINGS })),
  certifications: arrayOf(object({ name: STRING, issuer: STRING, date: STRING })),
  languages: arrayOf(object({ language: STRING, level: STRING })),
  military_or_service: arrayOf(ENTRY),
  volunteering: arrayOf(ENTRY),
  other: STRINGS,
  preferences: object({ seniority: STRINGS, locations: STRINGS, work_model: STRINGS, job_types: STRINGS, notes: STRING }),
});

const SYSTEM = `You turn the text of a CV into structured profile data.
- Copy facts exactly as the CV states them: names, job titles, organizations, dates, grades, contact
  details and links. Never invent, guess or improve anything.
- experience: paid jobs. military_or_service: military or national service. volunteering: unpaid work.
  facts: one item per thing the person did or achieved, close to the CV's wording.
- skills: group them the way the CV does, or into simple groups (e.g. "Languages", "Tools").
- Dates as written, preferably "YYYY-MM" or "YYYY"; "present" for current positions.
- Keep the CV's language (Hebrew stays Hebrew).
- Use "" or [] for anything the CV doesn't state. preferences are usually not in a CV: leave them empty
  unless the CV states them.`;

// The text of a CV file (PDF or DOCX), extracted locally.
export async function cvText(file: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  let text: string;
  if (ext === ".pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(file));
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (ext === ".docx") {
    text = (await mammoth.extractRawText({ buffer: file })).value;
  } else {
    throw new Error("Only PDF and DOCX CVs can be imported");
  }
  if (!text.trim()) {
    throw new Error("No text found in the CV (a scanned image?). Try a PDF exported from a word processor.");
  }
  return text;
}

// A draft profile from a CV. The caller shows it for review; nothing is saved here.
export async function importCv(ai: AiProvider, text: string): Promise<Profile> {
  const answer = await ai.generateJson<unknown>({ system: SYSTEM, prompt: text, schema: PROFILE_SCHEMA });
  return cleanProfile(answer);
}

// Keeps a copy of the imported CV as profile/example_cv.<ext> (used later as a style reference).
export async function saveExampleCv(workspace: string, file: Buffer, filename: string): Promise<string> {
  const dir = profileDir(workspace);
  await mkdir(dir, { recursive: true });
  for (const old of await readdir(dir)) {
    if (old.startsWith("example_cv.")) await rm(path.join(dir, old));
  }
  const name = "example_cv" + path.extname(filename).toLowerCase();
  await writeFile(path.join(dir, name), file);
  return name;
}
