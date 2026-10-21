import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import open from "open";
import { cvFilePath } from "./cvLibrary.js";
import { readJobs, updateJob, type JobRow } from "./jobsCsv.js";
import { loadProfile, safeFileName } from "./profile.js";
import { jobsCsvPath } from "./workspace.js";

// Helpers for the apply wizard (plan section 7).

const PREDEFINED = /^predefined: (.+)$/;

async function findJob(workspace: string, id: string): Promise<JobRow> {
  const row = (await readJobs(jobsCsvPath(workspace))).rows.find((r) => r.id === id);
  if (!row) throw new Error(`No job with id ${id}`);
  return row;
}

// The file name employers see: "Amit_Kahlon_CV.pdf" (just "CV.pdf" if the
// profile has no name in ASCII letters).
export function cvFileName(personName: string, ext: string): string {
  const owner = personName.trim() ? safeFileName(personName).replace(/ +/g, "_") : "";
  return `${owner && owner !== "file" ? owner + "_" : ""}CV${ext}`;
}

// Copies the job's chosen library CV into its folder under the name employers
// see, and records it in the cv_file column. Returns the copy's full path.
export async function prepareJobCv(workspace: string, id: string): Promise<string> {
  const row = await findJob(workspace, id);
  const match = (row.cv_choice ?? "").match(PREDEFINED);
  if (!match) throw new Error("Choose a CV for this job first");
  const source = cvFilePath(workspace, match[1]);

  const { profile } = await loadProfile(workspace);
  const dir = path.join(workspace, "jobs", id);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, cvFileName(profile.personal.name, path.extname(source)));
  await copyFile(source, target);

  const relative = path.relative(workspace, target).split(path.sep).join("/");
  if (row.cv_file !== relative) await updateJob(jobsCsvPath(workspace), id, { cv_file: relative });
  return target;
}

// Opens the job's links (employer page, agency page) in the user's normal browser (lesson 9.7).
export async function openJobLinks(workspace: string, id: string): Promise<number> {
  const row = await findJob(workspace, id);
  const links = [row.job_link, row.agency_link].filter((link) => /^(https?:\/\/|mailto:)/.test(link ?? ""));
  for (const link of links) await open(link);
  return links.length;
}

// Opens the file manager with the file selected, so it can be dragged into a form.
// Falls back to just opening the folder where selecting isn't supported.
export async function showInFolder(file: string): Promise<void> {
  if (process.platform === "win32") {
    // explorer wants exactly: /select,"C:\path\to\file"
    await run("explorer.exe", [`/select,"${file}"`], { windowsVerbatimArguments: true, anyExitCode: true });
  } else if (process.platform === "darwin") {
    await run("open", ["-R", file]);
  } else {
    // Most Linux file managers (Nautilus, Dolphin, Nemo, ...) support this D-Bus call.
    const shown = await run("dbus-send", [
      "--session", "--print-reply", "--dest=org.freedesktop.FileManager1", "--type=method_call",
      "/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems",
      `array:string:file://${encodeURI(file)}`, "string:",
    ]).then(() => true, () => false);
    if (!shown) await open(path.dirname(file));
  }
}

function run(
  command: string,
  args: string[],
  options: { windowsVerbatimArguments?: boolean; anyExitCode?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      windowsVerbatimArguments: options.windowsVerbatimArguments,
    });
    child.on("error", reject);
    // explorer.exe exits with 1 even when it worked
    child.on("close", (code) =>
      code === 0 || options.anyExitCode ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}
