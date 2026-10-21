import { spawn } from "node:child_process";
import path from "node:path";
import open from "open";
import { jobCvFile } from "./cvBuild.js";
import { readJobs, type JobRow } from "./jobsCsv.js";
import { jobsCsvPath } from "./workspace.js";

// Helpers for the apply wizard (plan section 7).

async function findJob(workspace: string, id: string): Promise<JobRow> {
  const row = (await readJobs(jobsCsvPath(workspace))).rows.find((r) => r.id === id);
  if (!row) throw new Error(`No job with id ${id}`);
  return row;
}

// The job's CV in its folder, under the name employers see: the built CV, or a
// copy of its chosen library CV. Returns the full path.
export async function prepareJobCv(workspace: string, id: string): Promise<string> {
  const file = await jobCvFile(workspace, id);
  if (!file) throw new Error("This job has no CV yet: choose one or create it");
  return file;
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
