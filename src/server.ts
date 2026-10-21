import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addLinks, jobJsonPath } from "./add.js";
import { defaultAi } from "./ai/default.js";
import { today } from "./dates.js";
import { CsvLockedError, readJobs, updateJob } from "./jobsCsv.js";
import { extractJobLinks } from "./links.js";
import { fillRequirements } from "./requirements.js";
import { jobsCsvPath } from "./workspace.js";

// The built page: vite builds it into dist/ui, next to this file once compiled.
const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");

// Job ids are also folder names; anything else must not reach the file system.
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export function createServer(workspace: string): express.Express {
  const csvPath = jobsCsvPath(workspace);
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  let adding = false; // one "add jobs" run at a time (it uses one browser profile)

  app.get("/api/jobs", async (_req, res) => {
    res.json(await readJobs(csvPath));
  });

  // Body: { "submitted": true | false }
  app.patch("/api/jobs/:id", async (req, res) => {
    const submitted = req.body?.submitted === true;
    try {
      await updateJob(csvPath, req.params.id, {
        submitted: submitted ? "YES" : "",
        submitted_date: submitted ? today() : "",
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(err instanceof CsvLockedError ? 409 : 500).json({ error: errorMessage(err) });
    }
  });

  // The job's saved job.json (description, requirements, ...), if there is one.
  app.get("/api/jobs/:id/details", async (req, res) => {
    const id = req.params.id;
    if (!SAFE_ID.test(id)) {
      res.status(400).json({ error: "Bad job id" });
      return;
    }
    try {
      res.json(JSON.parse(await readFile(jobJsonPath(workspace, id), "utf8")));
    } catch {
      res.status(404).json({ error: "No details saved for this job" });
    }
  });

  // Reads the job's description with AI and saves its requirements; answers with them.
  app.post("/api/jobs/:id/requirements", async (req, res) => {
    const id = req.params.id;
    if (!SAFE_ID.test(id)) {
      res.status(400).json({ error: "Bad job id" });
      return;
    }
    try {
      res.json(await fillRequirements(workspace, defaultAi(), id));
    } catch (err) {
      res.status(err instanceof CsvLockedError ? 409 : 500).json({ error: errorMessage(err) });
    }
  });

  // Body: { "text": "<pasted messages>" }. Answers with one JSON object per line
  // as each link is handled, so the page can show progress.
  app.post("/api/add", async (req, res) => {
    if (adding) {
      res.status(409).json({ error: "Already adding jobs; wait for that to finish." });
      return;
    }
    adding = true;
    res.setHeader("Content-Type", "application/x-ndjson");
    const send = (event: object) => res.write(JSON.stringify(event) + "\n");
    try {
      const { jobLinks, skipped } = extractJobLinks(String(req.body?.text ?? ""));
      send({ type: "start", links: jobLinks.length, ignored: skipped.length });
      const { loggedOut } = await addLinks(workspace, jobLinks, {
        saveRow: async (write) => {
          await write();
          return true;
        },
        onResult: (result) => send({ type: "result", ...result }),
      });
      send({ type: "done", loggedOut });
    } catch (err) {
      send({ type: "error", error: errorMessage(err) });
    } finally {
      adding = false;
      res.end();
    }
  });

  app.use(express.static(UI_DIR));
  return app;
}

function errorMessage(err: unknown): string {
  if (err instanceof CsvLockedError) {
    return "jobs.csv is open in another program (Excel?). Close it and try again.";
  }
  return err instanceof Error ? err.message : String(err);
}
