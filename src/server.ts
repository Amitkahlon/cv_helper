import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { today } from "./dates.js";
import { CsvLockedError, readJobs, updateJob } from "./jobsCsv.js";
import { jobsCsvPath } from "./workspace.js";

// The built page: vite builds it into dist/ui, next to this file once compiled.
const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");

export function createServer(workspace: string): express.Express {
  const csvPath = jobsCsvPath(workspace);
  const app = express();
  app.use(express.json());

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
      if (err instanceof CsvLockedError) {
        res.status(409).json({ error: "jobs.csv is open in another program (Excel?). Close it and try again." });
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  app.use(express.static(UI_DIR));
  return app;
}
