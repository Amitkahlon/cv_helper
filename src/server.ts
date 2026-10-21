import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addLinks, jobJsonPath } from "./add.js";
import { openJobLinks, prepareJobCv, showInFolder } from "./apply.js";
import { defaultAi } from "./ai/default.js";
import { cvText, importCv, saveExampleCv } from "./cvImport.js";
import { addCv, cvChoice, cvFilePath, deleteCv, loadCvs, saveCvs } from "./cvLibrary.js";
import { today } from "./dates.js";
import { CsvLockedError, readJobs, updateJob, type JobRow } from "./jobsCsv.js";
import { extractJobLinks } from "./links.js";
import { cleanProfile, cleanRoles, loadProfile, saveProfile } from "./profile.js";
import { profileQuestions } from "./profileQuestions.js";
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

  // Body: any of { "submitted": true | false, "cv_choice": "predefined: <file>" | "",
  // "note": "text to add to the notes column" }
  app.patch("/api/jobs/:id", async (req, res) => {
    const changes: JobRow = {};
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (note) {
      const row = (await readJobs(csvPath)).rows.find((r) => r.id === req.params.id);
      changes.notes = [row?.notes, `${today()}: ${note}`].filter(Boolean).join("; ");
    }
    if (typeof req.body?.submitted === "boolean") {
      changes.submitted = req.body.submitted ? "YES" : "";
      changes.submitted_date = req.body.submitted ? today() : "";
    }
    if (typeof req.body?.cv_choice === "string") {
      const choice = req.body.cv_choice;
      if (choice && !(await loadCvs(workspace)).some((cv) => cvChoice(cv.file) === choice)) {
        res.status(400).json({ error: `Unknown CV choice: ${choice}` });
        return;
      }
      changes.cv_choice = choice;
    }
    try {
      await updateJob(csvPath, req.params.id, changes);
      res.json({ ok: true });
    } catch (err) {
      res.status(err instanceof CsvLockedError ? 409 : 500).json({ error: errorMessage(err) });
    }
  });

  // --- Apply wizard ---

  // Copies the chosen CV into the job folder; answers with its full path.
  app.post("/api/jobs/:id/prepare-cv", async (req, res) => {
    try {
      res.json({ path: await prepareJobCv(workspace, req.params.id) });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // Same, then opens the file manager with the CV selected.
  app.post("/api/jobs/:id/show-cv", async (req, res) => {
    try {
      const file = await prepareJobCv(workspace, req.params.id);
      await showInFolder(file);
      res.json({ path: file });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // Opens the job's links in the user's normal browser.
  app.post("/api/jobs/:id/open-links", async (req, res) => {
    try {
      res.json({ opened: await openJobLinks(workspace, req.params.id) });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
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

  // --- Profile (plan section 6) ---

  app.get("/api/profile", async (_req, res) => {
    res.json(await loadProfile(workspace));
  });

  // Body: { profile, roles, rules }. Answers with the saved (cleaned) data.
  app.put("/api/profile", async (req, res) => {
    res.json(await saveProfile(workspace, req.body ?? {}));
  });

  // Body: the CV file itself; ?name=<original file name>. Answers with a draft
  // profile for review: the profile itself is not changed.
  app.post("/api/profile/import", express.raw({ type: "*/*", limit: "20mb" }), async (req, res) => {
    const name = String(req.query.name ?? "");
    try {
      const file = req.body as Buffer;
      const text = await cvText(file, name);
      await saveExampleCv(workspace, file, name);
      res.json({ draft: await importCv(defaultAi(), text) });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // Body: { profile, roles } (the form as it is now, saved or not).
  app.post("/api/profile/questions", async (req, res) => {
    try {
      const profile = cleanProfile(req.body?.profile);
      const roles = cleanRoles(req.body?.roles);
      res.json({ questions: await profileQuestions(defaultAi(), profile, roles) });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // --- CV library ---

  app.get("/api/cvs", async (_req, res) => {
    res.json(await loadCvs(workspace));
  });

  // Body: the list with edited names, categories and purposes.
  app.put("/api/cvs", async (req, res) => {
    res.json(await saveCvs(workspace, req.body));
  });

  // Body: the CV file itself; ?name=<original file name>. Answers with the new entry.
  app.post("/api/cvs", express.raw({ type: "*/*", limit: "20mb" }), async (req, res) => {
    try {
      res.json(await addCv(workspace, req.body as Buffer, String(req.query.name ?? "")));
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.delete("/api/cvs/:file", async (req, res) => {
    try {
      await deleteCv(workspace, req.params.file);
      res.json({ ok: true });
    } catch (err) {
      res.status(err instanceof CsvLockedError ? 409 : 400).json({ error: errorMessage(err) });
    }
  });

  // The file itself, to open in the browser.
  app.get("/api/cvs/:file", (req, res) => {
    try {
      res.sendFile(cvFilePath(workspace, req.params.file));
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
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
