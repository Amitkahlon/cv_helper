#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import open from "open";
import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";
import { addLinks } from "./add.js";
import { workspaceAi } from "./ai/default.js";
import { cvText, importCv, saveExampleCv } from "./cvImport.js";
import { buildCv, jobsNeedingCv } from "./cvBuild.js";
import { createDemoWorkspace } from "./demo.js";
import { CsvLockedError } from "./jobsCsv.js";
import { extractJobLinks } from "./links.js";
import { loadProfile, profileDir, saveProfile } from "./profile.js";
import { fillRequirements, jobsNeedingRequirements } from "./requirements.js";
import { createServer } from "./server.js";
import { loadSettings, saveSettings } from "./settings.js";
import { createWorkspace, jobsCsvPath, workspaceExists } from "./workspace.js";

const USAGE = `Usage: cvhelper <command>
  init                         choose the workspace folder
  add                          paste messages or links; adds the jobs
  links                        paste messages; lists the job links in them
  profile import <cv file>     fill the profile from a PDF or DOCX CV
  requirements [ids] [--limit N] [--all]
                               extract requirements with AI (default: jobs not
                               submitted or rejected that don't have them yet)
  build [ids] [--limit N] [--instructions "..."]
                               build CVs with AI (default: jobs not submitted
                               or rejected that have no CV yet)
  ui [--workspace <folder>]    open the web UI (on another workspace without
                               changing your saved one)
  demo [folder]                create a demo workspace with made-up data`;
const UI_PORT = 4321;

const [command, ...commandArgs] = process.argv.slice(2);

switch (command) {
  case "init":
    await runInit();
    break;
  case "add":
    await runAdd();
    break;
  case "profile":
    await runProfile(commandArgs);
    break;
  case "build":
    await runBuild(commandArgs);
    break;
  case "requirements":
    await runRequirements(commandArgs);
    break;
  case "links":
    await runLinks();
    break;
  case "ui":
    await runUi(commandArgs);
    break;
  case "demo":
    await runDemo(commandArgs);
    break;
  default:
    console.error(USAGE);
    process.exitCode = 1;
}

// Asks for the workspace folder, creates it and saves the choice.
async function runInit(): Promise<string> {
  const current = await loadSettings();
  const suggested = current?.workspace ?? path.join(os.homedir(), "cvhelper");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Workspace folder [${suggested}]: `);
  rl.close();

  // Windows "Copy as path" wraps the path in quotes.
  const typed = answer.trim().replace(/^["']|["']$/g, "");
  const workspace = path.resolve(expandHome(typed || suggested));

  await createWorkspace(workspace);
  await saveSettings({ workspace });
  console.log(`Workspace: ${workspace}`);
  console.log(`Tracker:   ${jobsCsvPath(workspace)}`);
  return workspace;
}

// Returns the workspace folder, running init first if it isn't set up yet.
async function requireWorkspace(): Promise<string> {
  const settings = await loadSettings();
  if (settings && (await workspaceExists(settings.workspace))) {
    return settings.workspace;
  }
  console.log("No workspace set up yet, running init first.");
  return runInit();
}

// Runs a CSV write; while the file is locked, asks the user to close it and retry.
// Returns false if the user cancels.
async function withCsvRetry(write: () => Promise<void>): Promise<boolean> {
  while (true) {
    try {
      await write();
      return true;
    } catch (err) {
      if (!(err instanceof CsvLockedError)) throw err;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(
        `${path.basename(err.csvPath)} is open in another program (Excel?). ` +
          "Close it and press Enter to retry, or type q to cancel: ",
      );
      rl.close();
      if (answer.trim().toLowerCase() === "q") return false;
    }
  }
}

// "~/jobs" -> "/home/amit/jobs" (the shell does this, but not inside a prompt).
function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

async function runUi(args: string[]): Promise<void> {
  const flag = args.indexOf("--workspace");
  const workspace = flag >= 0 && args[flag + 1] ? path.resolve(expandHome(args[flag + 1])) : await requireWorkspace();
  if (!(await workspaceExists(workspace))) {
    console.error(`No workspace in ${workspace} (run cvhelper init, or cvhelper demo ${workspace})`);
    process.exitCode = 1;
    return;
  }
  const url = `http://127.0.0.1:${UI_PORT}`;
  const server = createServer(workspace).listen(UI_PORT, "127.0.0.1", () => {
    console.log(`cvhelper UI running at ${url} for ${workspace} (Ctrl+C to stop)`);
    void open(url);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EADDRINUSE") throw err;
    console.error(`Port ${UI_PORT} is already in use: cvhelper ui is probably running already. Opening ${url}.`);
    void open(url);
  });
}

// cvhelper demo [folder]
async function runDemo(args: string[]): Promise<void> {
  const folder = path.resolve(expandHome(args[0] ?? path.join(os.homedir(), "cvhelper-demo")));
  if (await workspaceExists(folder)) {
    console.error(`${folder} already has a workspace; pick another folder.`);
    process.exitCode = 1;
    return;
  }
  await createDemoWorkspace(folder);
  console.log(`Demo workspace created in ${folder}.`);
  console.log(`Open it with: cvhelper ui --workspace "${folder}"`);
}

async function runLinks(): Promise<void> {
  const text = await readPasted();
  const { jobLinks, skipped } = extractJobLinks(text);

  console.log(`\nJob links (${jobLinks.length}):`);
  for (const link of jobLinks) console.log(`  ${link}`);

  console.log(`\nSkipped (${skipped.length}):`);
  for (const link of skipped) console.log(`  ${link}`);
}

async function runAdd(): Promise<void> {
  const workspace = await requireWorkspace();
  const { jobLinks, skipped } = extractJobLinks(await readPasted());
  if (skipped.length) console.log(`\nIgnoring ${skipped.length} non-job link(s).`);
  console.log(`Checking ${jobLinks.length} job link(s)...\n`);

  const { results, loggedOut } = await addLinks(workspace, jobLinks, {
    saveRow: withCsvRetry,
    onResult: (r) => {
      const what = r.id ? `${r.id}  ${r.title}` : r.link;
      console.log(`  ${r.outcome.padEnd(11)} ${what}${r.detail ? `  (${r.detail})` : ""}`);
    },
  });

  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
  console.log("\n" + [...counts].map(([outcome, n]) => `${n} ${outcome}`).join(", "));
  if (loggedOut) {
    console.log("WARNING: HireMe answered as logged out, so company names and apply links are missing.");
  }
}

// cvhelper profile import <cv file>: fills profile.yaml from a CV. If a profile
// already exists, the import goes to profile.imported.yaml instead, to compare.
async function runProfile(args: string[]): Promise<void> {
  const [action, file] = args;
  if (action !== "import" || !file) {
    console.error("Usage: cvhelper profile import <cv.pdf|cv.docx>");
    process.exitCode = 1;
    return;
  }
  const workspace = await requireWorkspace();
  const content = await readFile(file);
  const text = await cvText(content, file);
  const ai = await workspaceAi(workspace);
  console.log(`Reading ${path.basename(file)} with ${ai.name}...`);
  const draft = await importCv(ai, text);
  await saveExampleCv(workspace, content, file);

  const current = await loadProfile(workspace);
  if (current.exists) {
    const target = path.join(profileDir(workspace), "profile.imported.yaml");
    await writeFile(target, YAML.stringify(draft), "utf8");
    console.log(`You already have a profile, so the import was saved to ${target} to compare.`);
  } else {
    await saveProfile(workspace, { profile: draft, roles: current.roles, rules: current.rules });
    console.log(`Profile saved to ${path.join(profileDir(workspace), "profile.yaml")}. Review it in the UI (Profile page).`);
  }
  console.log(`${draft.experience.length} jobs, ${draft.projects.length} projects, ${draft.education.length} education entries.`);
}

// cvhelper build [ids...] [--limit N] [--instructions "..."]
async function runBuild(args: string[]): Promise<void> {
  const workspace = await requireWorkspace();
  const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const flagValues = new Set(["--limit", "--instructions"].map((f) => args.indexOf(f) + 1).filter((i) => i > 0));
  const ids = args.filter((arg, i) => !arg.startsWith("--") && !flagValues.has(i));
  const limit = Number(valueOf("--limit") ?? Infinity);
  const todo = (ids.length ? ids : await jobsNeedingCv(workspace)).slice(0, limit);
  const ai = await workspaceAi(workspace);
  console.log(`Building ${todo.length} CV(s) with ${ai.name}...\n`);
  for (const id of todo) {
    try {
      const report = await buildCv(workspace, ai, id, { instructions: valueOf("--instructions") });
      console.log(`  built   ${id}  score ${report.score}  (${report.choice})`);
      for (const warning of report.warnings) console.log(`          ! ${warning}`);
    } catch (err) {
      console.log(`  failed  ${id}  (${err instanceof Error ? err.message : String(err)})`);
    }
  }
}

// cvhelper requirements [ids...] [--limit N] [--all]
async function runRequirements(args: string[]): Promise<void> {
  const workspace = await requireWorkspace();
  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
  const ids = args.filter((arg, i) => !arg.startsWith("--") && !(limitAt >= 0 && i === limitAt + 1));
  const todo = (ids.length ? ids : await jobsNeedingRequirements(workspace, args.includes("--all"))).slice(
    0,
    limit,
  );
  const ai = await workspaceAi(workspace);
  console.log(`Extracting requirements for ${todo.length} job(s) with ${ai.name}...\n`);

  for (const id of todo) {
    try {
      const requirements = await fillRequirements(workspace, ai, id, withCsvRetry);
      console.log(`  done    ${id}  (${requirements.must_have.length} must-have, ${requirements.field})`);
    } catch (err) {
      console.log(`  failed  ${id}  (${err instanceof Error ? err.message : String(err)})`);
    }
  }
}

// Reads pasted text until Ctrl+D on an empty line. Reading through readline
// (instead of reading stdin to its end) keeps stdin usable for later prompts.
async function readPasted(): Promise<string> {
  console.log("Paste the messages, then press Enter and Ctrl+D:");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("SIGINT", () => process.exit(130)); // keep Ctrl+C working while pasting
  const lines: string[] = [];
  for await (const line of rl) lines.push(line);
  return lines.join("\n");
}
