import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AiProvider } from "./provider.js";

const TIMEOUT_MS = 5 * 60 * 1000;

// Claude through the Claude Code CLI in headless mode, on the user's own
// subscription (no API key). Runs with no tools, from an empty temporary
// folder, so the model only sees what is in the prompt.
export function claudeCli(options: { model?: string } = {}): AiProvider {
  return {
    name: `claude-cli${options.model ? ` (${options.model})` : ""}`,
    async generateJson<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      const args = [
        "-p",
        "--output-format", "json",
        "--json-schema", JSON.stringify(schema),
        "--system-prompt", system,
        "--tools", "",
        "--no-session-persistence",
      ];
      if (options.model) args.push("--model", options.model);

      const output = await run("claude", args, prompt);
      let answer: { is_error?: boolean; result?: string; structured_output?: T };
      try {
        answer = JSON.parse(output);
      } catch {
        throw new Error(`Claude CLI gave an unexpected answer: ${output.slice(0, 200)}`);
      }
      if (answer.is_error || answer.structured_output === undefined) {
        throw new Error(`Claude CLI error: ${String(answer.result ?? "no structured answer").slice(0, 200)}`);
      }
      return answer.structured_output;
    },
  };
}

// Runs a command with `input` on stdin, from a fresh empty folder; resolves with stdout.
export async function run(command: string, args: string[], input: string): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "cvhelper-ai-"));
  try {
    return await new Promise<string>((resolve, reject) => {
      // No shell, so the JSON schema and prompt arguments reach the CLI unchanged.
      const child = spawn(command, args, { cwd });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`${command} took longer than ${TIMEOUT_MS / 60000} minutes`));
      }, TIMEOUT_MS);
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Could not run ${command}: ${err.message}. Is it installed?`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 || stdout.trim()) resolve(stdout);
        else reject(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 200)}`));
      });
      child.stdin.end(input);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
