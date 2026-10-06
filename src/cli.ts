#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { extractJobLinks } from "./links.js";
import { loadSettings, saveSettings } from "./settings.js";
import { createWorkspace, jobsCsvPath, workspaceExists } from "./workspace.js";

const USAGE = "Usage: cvhelper <init|links>";

const [command] = process.argv.slice(2);

switch (command) {
  case "init":
    await runInit();
    break;
  case "links":
    await runLinks();
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

// "~/jobs" -> "/home/amit/jobs" (the shell does this, but not inside a prompt).
function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

async function runLinks(): Promise<void> {
  const text = await readPasted();
  const { jobLinks, skipped } = extractJobLinks(text);

  console.log(`\nJob links (${jobLinks.length}):`);
  for (const link of jobLinks) console.log(`  ${link}`);

  console.log(`\nSkipped (${skipped.length}):`);
  for (const link of skipped) console.log(`  ${link}`);
}

async function readPasted(): Promise<string> {
  console.log(
    "Paste the messages, then press Enter and Ctrl+D (on Windows: Ctrl+Z, then Enter):",
  );
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
