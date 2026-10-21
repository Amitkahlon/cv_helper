import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { readJobs, updateJob } from "./jobsCsv.js";
import { cleanCvs, profileDir, safeFileName } from "./profile.js";
import type { CvEntry } from "./profileTypes.js";
import { jobsCsvPath } from "./workspace.js";

// The CV library: ready-made CV files in profile/cvs/, described in profile/cvs.yaml.
// A job uses one through its cv_choice column: "predefined: <file>".

export function cvsDir(workspace: string): string {
  return path.join(profileDir(workspace), "cvs");
}

function listFile(workspace: string): string {
  return path.join(profileDir(workspace), "cvs.yaml");
}

export function cvChoice(file: string): string {
  return `predefined: ${file}`;
}

export async function loadCvs(workspace: string): Promise<CvEntry[]> {
  try {
    return cleanCvs(YAML.parse(await readFile(listFile(workspace), "utf8"))?.cvs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

// Saves names, categories and purposes. Only CVs already in the library are kept:
// files are added with addCv and removed with deleteCv.
export async function saveCvs(workspace: string, cvs: unknown): Promise<CvEntry[]> {
  const known = new Set((await loadCvs(workspace)).map((cv) => cv.file));
  const cleaned = cleanCvs(cvs).filter((cv) => known.has(cv.file));
  await writeList(workspace, cleaned);
  return cleaned;
}

// Stores an uploaded CV under a safe, unused file name and adds it to the library.
export async function addCv(workspace: string, content: Buffer, originalName: string): Promise<CvEntry> {
  const safe = safeFileName(originalName);
  const ext = path.extname(safe);
  if (ext !== ".pdf" && ext !== ".docx") throw new Error("CVs must be PDF or DOCX files");

  const dir = cvsDir(workspace);
  await mkdir(dir, { recursive: true });
  const stem = safe.slice(0, -ext.length);
  let file = safe;
  for (let n = 2; await exists(path.join(dir, file)); n++) file = `${stem}-${n}${ext}`;
  await writeFile(path.join(dir, file), content);

  const entry: CvEntry = {
    file,
    name: path.basename(originalName, path.extname(originalName)).trim() || stem,
    category: "",
    purpose: "",
  };
  await writeList(workspace, [...(await loadCvs(workspace)), entry]);
  return entry;
}

// Removes a CV from the library and from any job that had chosen it.
export async function deleteCv(workspace: string, file: string): Promise<void> {
  const cvs = await loadCvs(workspace);
  if (!cvs.some((cv) => cv.file === file)) throw new Error(`No CV named ${file}`);
  await rm(cvFilePath(workspace, file), { force: true });
  await writeList(workspace, cvs.filter((cv) => cv.file !== file));

  const csvPath = jobsCsvPath(workspace);
  for (const row of (await readJobs(csvPath)).rows) {
    if (row.cv_choice === cvChoice(file)) await updateJob(csvPath, row.id, { cv_choice: "" });
  }
}

// The full path of a library CV; refuses names that could point outside the folder.
export function cvFilePath(workspace: string, file: string): string {
  if (file !== safeFileName(file)) throw new Error(`Bad CV file name: ${file}`);
  return path.join(cvsDir(workspace), file);
}

async function writeList(workspace: string, cvs: CvEntry[]): Promise<void> {
  await mkdir(profileDir(workspace), { recursive: true });
  await writeFile(
    listFile(workspace),
    "# Your ready-made CVs (files in cvs/). A job uses one through its cv_choice column.\n" +
      YAML.stringify({ cvs }),
    "utf8",
  );
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// The file name employers see: "Amit_Kahlon_CV.pdf" (just "CV.pdf" if the
// profile has no name in ASCII letters).
export function cvFileName(personName: string, ext: string): string {
  const owner = personName.trim() ? safeFileName(personName).replace(/ +/g, "_") : "";
  return `${owner && owner !== "file" ? owner + "_" : ""}CV${ext}`;
}
