#!/usr/bin/env node

import { extractJobLinks } from "./links.js";

const USAGE = "Usage: cvhelper links";

const [command] = process.argv.slice(2);

switch (command) {
  case "links":
    await runLinks();
    break;
  default:
    console.error(USAGE);
    process.exitCode = 1;
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
