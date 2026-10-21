#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import open from "open";
import { addLinks } from "./add.js";
import { CsvLockedError } from "./jobsCsv.js";
import { extractJobLinks } from "./links.js";
import { createServer } from "./server.js";
import { loadSettings, saveSettings } from "./settings.js";
import { createWorkspace, jobsCsvPath, workspaceExists } from "./workspace.js";

const USAGE = "Usage: cvhelper <init|add|links|ui>";
const UI_PORT = 4321;

const [command] = process.argv.slice(2);

switch (command) {
  case "init":
    await runInit();
    break;
  case "add":
    await runAdd();
    break;
  case "links":
    await runLinks();
    break;
  case "ui":
    await runUi();
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

async function runUi(): Promise<void> {
  const workspace = await requireWorkspace();
  const url = `http://127.0.0.1:${UI_PORT}`;
  createServer(workspace).listen(UI_PORT, "127.0.0.1", () => {
    console.log(`cvhelper UI running at ${url} (Ctrl+C to stop)`);
    void open(url);
  });
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
