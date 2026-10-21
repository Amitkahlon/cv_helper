import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "./claudeCli.js";
import type { AiProvider } from "./provider.js";

// ChatGPT through the Codex CLI and Gemini through the Gemini CLI, each on the
// user's own account. Neither takes a JSON schema on the command line, so the
// schema goes into the prompt and the JSON is taken out of the answer.

function withSchema(system: string, prompt: string, schema: object): string {
  return [
    system,
    "",
    prompt,
    "",
    "Answer with only a JSON value matching this JSON Schema, and nothing else:",
    JSON.stringify(schema),
  ].join("\n");
}

// The JSON in an answer that may be wrapped in text or a ``` block.
export function jsonFromAnswer(answer: string): unknown {
  const start = answer.search(/[{[]/);
  const end = Math.max(answer.lastIndexOf("}"), answer.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error(`No JSON in the answer: ${answer.slice(0, 200)}`);
  return JSON.parse(answer.slice(start, end + 1));
}

export function codexCli(options: { model?: string } = {}): AiProvider {
  return {
    name: `codex-cli${options.model ? ` (${options.model})` : ""}`,
    async generateJson<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      const dir = await mkdtemp(path.join(os.tmpdir(), "cvhelper-codex-"));
      try {
        const answerFile = path.join(dir, "answer.txt");
        const args = ["exec", "--skip-git-repo-check", "--output-last-message", answerFile];
        if (options.model) args.push("--model", options.model);
        args.push("-"); // read the prompt from stdin
        await run("codex", args, withSchema(system, prompt, schema));
        return jsonFromAnswer(await readFile(answerFile, "utf8")) as T;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

export function geminiCli(options: { model?: string } = {}): AiProvider {
  return {
    name: `gemini-cli${options.model ? ` (${options.model})` : ""}`,
    async generateJson<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      // The prompt goes on stdin; -p makes the CLI answer once and exit.
      const args = ["-p", "Follow the instructions above."];
      if (options.model) args.push("--model", options.model);
      const output = await run("gemini", args, withSchema(system, prompt, schema));
      return jsonFromAnswer(output) as T;
    },
  };
}
