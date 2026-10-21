import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addLinks, jobJsonPath } from "./add.js";
import { openJobLinks, prepareJobCv, showInFolder } from "./apply.js";
import { workspaceAi } from "./ai/default.js";
import type { AiProvider } from "./ai/provider.js";
import { cvText, importCv, saveExampleCv } from "./cvImport.js";
import { addCv, cvFilePath, deleteCv, loadCvs, saveCvs } from "./cvLibrary.js";
import { buildCv, isKnownChoice, jobCvFile, loadCvReport, suggestCvChoice } from "./cvBuild.js";
import { BULK_ACTIONS } from "./bulk.js";
import type { JobRecord } from "./add.js";
import type { Requirements } from "./requirements.js";
import { today } from "./dates.js";
import { CsvLockedError, readJobs, updateJob, type JobRow } from "./jobsCsv.js";
import { extractJobLinks } from "./links.js";
import { linkInfo } from "./jobKey.js";
import { cleanProfile, cleanRoles, loadProfile, saveProfile } from "./profile.js";
import { profileQuestions } from "./profileQuestions.js";
import { fillRequirements } from "./requirements.js";
import { cleanConfig, loadConfig, PROVIDERS, saveConfig } from "./config.js";
import { loadSettings, saveSettings } from "./settings.js";
import { createWorkspace, jobsCsvPath } from "./workspace.js";

// The built page: vite builds it into dist/ui, next to this file once compiled.
const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");

// Date columns for what happened after submitting (plan section 4).
const EVENT_COLUMNS = ["phone_call_date", "interview_date", "rejected_date", "offer_date"];

// Job ids are also folder names; anything else must not reach the file system.
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export function createServer(initialWorkspace: string): express.Express {
  // The workspace can be switched from the Settings tab; handlers read these on each request.
  let workspace = initialWorkspace;
  let csvPath = jobsCsvPath(workspace);
  const app = express();
  app.use(onlyThisComputer);
  app.use(express.json({ limit: "5mb" }));
  let adding = false; // one "add jobs" run at a time (it uses one browser profile)
  let busy = ""; // the slow bulk action running now (one at a time), or ""
  let currentJob = ""; // the job the Apply wizard is showing, for the Chrome extension

  app.get("/api/jobs", async (_req, res) => {
    res.json(await readJobs(csvPath));
  });

  // Body: any of { "submitted": true | false, "cv_choice": "predefined: <file>" | "",
  // "note": "text to add to the notes column", "notes": "the whole notes column",
  // "phone_call_date" | "interview_date" | "rejected_date" | "offer_date": "YYYY-MM-DD" | "" }
  app.patch("/api/jobs/:id", async (req, res) => {
    const changes: JobRow = {};
    for (const column of EVENT_COLUMNS) {
      const value = req.body?.[column];
      if (typeof value === "string" && (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))) changes[column] = value;
    }
    if (typeof req.body?.notes === "string") changes.notes = req.body.notes;
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
      if (!(await isKnownChoice(workspace, choice))) {
        res.status(400).json({ error: `Unknown CV choice: ${choice}` });
        return;
      }
      const row = (await readJobs(csvPath)).rows.find((r) => r.id === req.params.id);
      if (row && row.cv_choice !== choice) {
        // A different CV: the old build and score no longer apply.
        Object.assign(changes, { cv_choice: choice, cv_status: "", score: "" });
      }
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

  // --- CVs per job (phase 5) ---

  // Body: { "instructions"?: "emphasise the SQL work" }. Answers with the CV report.
  app.post("/api/jobs/:id/build-cv", async (req, res) => {
    try {
      const ai = await workspaceAi(workspace);
      res.json(await buildCv(workspace, ai, req.params.id, { instructions: String(req.body?.instructions ?? "") }));
    } catch (err) {
      res.status(err instanceof CsvLockedError ? 409 : 500).json({ error: errorMessage(err) });
    }
  });

  // Body: { "action": one of BULK_ACTIONS, "ids": [...], "params"?: {...} }.
  // Streams one JSON object per line: start, a result per job, then done (or error).
  app.post("/api/jobs/bulk", async (req, res) => {
    const name = String(req.body?.action ?? "");
    const action = Object.hasOwn(BULK_ACTIONS, name) ? BULK_ACTIONS[name] : undefined;
    const ids: string[] = Array.isArray(req.body?.ids) ? [...new Set<string>(req.body.ids.map(String))] : [];
    if (!action) {
      res.status(400).json({ error: `Unknown action: ${name}` });
      return;
    }
    if (ids.length === 0) {
      res.status(400).json({ error: "No jobs selected" });
      return;
    }
    if (action.slow && busy) {
      res.status(409).json({ error: `Still running "${busy}"; wait for it to finish.` });
      return;
    }
    if (action.slow) busy = name;
    res.setHeader("Content-Type", "application/x-ndjson");
    const send = (event: object) => res.write(JSON.stringify(event) + "\n");
    let ai: Promise<AiProvider> | undefined;
    try {
      send({ type: "start", action: name, count: ids.length });
      const params = req.body?.params && typeof req.body.params === "object" ? req.body.params : {};
      await action.run(ids, { workspace, params, ai: () => (ai ??= workspaceAi(workspace)) }, (id, ok, message) =>
        send({ type: "result", id, ok, message }),
      );
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", error: errorMessage(err) });
    } finally {
      if (action.slow) busy = "";
      res.end();
    }
  });

  // Asks the AI which CV fits the job and saves it as the job's cv_choice.
  app.post("/api/jobs/:id/suggest-cv", async (req, res) => {
    const id = req.params.id;
    try {
      if (!SAFE_ID.test(id)) throw new Error("Bad job id");
      const ai = await workspaceAi(workspace);
      const job: JobRecord = JSON.parse(await readFile(jobJsonPath(workspace, id), "utf8"));
      const requirements = (job.requirements as Requirements | null) ?? (await fillRequirements(workspace, ai, id));
      const { roles } = await loadProfile(workspace);
      const choice = await suggestCvChoice(ai, job, requirements, roles, await loadCvs(workspace));
      await updateJob(csvPath, id, { cv_choice: choice, cv_status: "", score: "" });
      res.json({ choice });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // The CV report (checklist, score, what was adapted), or 404 if no CV was built.
  app.get("/api/jobs/:id/cv-report", async (req, res) => {
    const report = SAFE_ID.test(req.params.id) ? await loadCvReport(workspace, req.params.id) : null;
    if (report) res.json(report);
    else res.status(404).json({ error: "No CV built for this job yet" });
  });

  // The job's CV file itself (also used by the Chrome extension).
  app.get("/api/jobs/:id/cv-file", async (req, res) => {
    try {
      const file = await jobCvFile(workspace, req.params.id);
      if (!file) throw new Error("This job has no CV yet");
      res.download(file, path.basename(file));
    } catch (err) {
      res.status(404).json({ error: errorMessage(err) });
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
      res.json(await fillRequirements(workspace, await workspaceAi(workspace), id));
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
      res.json({ draft: await importCv(await workspaceAi(workspace), text) });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // Body: { profile, roles } (the form as it is now, saved or not).
  app.post("/api/profile/questions", async (req, res) => {
    try {
      const profile = cleanProfile(req.body?.profile);
      const roles = cleanRoles(req.body?.roles);
      res.json({ questions: await profileQuestions(await workspaceAi(workspace), profile, roles) });
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

  // --- Chrome extension ---

  // The Apply wizard says which job it is showing.
  app.post("/api/extension/current", (req, res) => {
    currentJob = String(req.body?.id ?? "");
    res.json({ ok: true });
  });

  // ?url=<the page the extension is on>. Answers with the open jobs, the one
  // matching that page (if any) and the wizard's current job.
  app.get("/api/extension/state", async (req, res) => {
    const open = (await readJobs(csvPath)).rows
      .filter((r) => !(r.submitted ?? "").trim() && !(r.filter ?? "").trim())
      .sort((a, b) => (b.posted_date || b.first_seen || "").localeCompare(a.posted_date || a.first_seen || ""));
    res.json({
      current: open.some((r) => r.id === currentJob) ? currentJob : "",
      match: matchingJob(open, String(req.query.url ?? "")),
      jobs: open.map((r) => ({
        id: r.id,
        title: r.title,
        company: r.company,
        cv_ready: r.cv_status === "built" || /^predefined:/.test(r.cv_choice ?? ""),
      })),
    });
  });

  // --- Settings ---

  // API keys are never sent back, only whether each one is set.
  app.get("/api/settings", async (_req, res) => {
    const keys = (await loadSettings())?.api_keys ?? {};
    res.json({
      workspace,
      config: await loadConfig(workspace),
      providers: PROVIDERS,
      keys_set: { anthropic: !!keys.anthropic, openai: !!keys.openai, gemini: !!keys.gemini },
    });
  });

  // Body: { config, api_keys?: { anthropic?: "new key" | "" (= remove), ... } }
  app.put("/api/settings", async (req, res) => {
    const config = await saveConfig(workspace, cleanConfig(req.body?.config));
    const changes = req.body?.api_keys;
    if (changes && typeof changes === "object") {
      const keys = { ...((await loadSettings())?.api_keys ?? {}) } as Record<string, string>;
      for (const name of ["anthropic", "openai", "gemini"]) {
        if (typeof changes[name] === "string") {
          if (changes[name].trim()) keys[name] = changes[name].trim();
          else delete keys[name];
        }
      }
      await saveSettings({ api_keys: keys });
    }
    res.json({ config });
  });

  // Body: { "path": "/folder" }. Creates the workspace if needed and switches to it.
  app.put("/api/workspace", async (req, res) => {
    const folder = String(req.body?.path ?? "").trim();
    if (!folder || !path.isAbsolute(folder)) {
      res.status(400).json({ error: "Give the full path of the workspace folder" });
      return;
    }
    await createWorkspace(folder);
    await saveSettings({ workspace: folder });
    workspace = folder;
    csvPath = jobsCsvPath(folder);
    res.json({ workspace });
  });

  app.use(express.static(UI_DIR));
  return app;
}

// Only pages on this computer may use the server. Otherwise any website open in
// the browser could send it requests (e.g. upload files), or reach it through a
// DNS name that points at 127.0.0.1 (DNS rebinding).
const LOCAL_ORIGIN = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?|chrome-extension:\/\/[a-p]{32})$/;

function onlyThisComputer(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (host !== "127.0.0.1" && host !== "localhost") {
    res.status(403).json({ error: "cvhelper only answers on 127.0.0.1" });
    return;
  }
  const origin = req.headers.origin;
  if (req.method !== "GET" && req.method !== "HEAD" && origin && !LOCAL_ORIGIN.test(origin)) {
    res.status(403).json({ error: "Requests from other websites are not allowed" });
    return;
  }
  next();
}

// The job whose link is the given page: the same job by our link keys, or a
// page under the job's link (e.g. its /apply page).
function matchingJob(rows: JobRow[], url: string): string {
  if (!/^https?:\/\//.test(url)) return "";
  const key = linkInfo(url).key;
  const bare = (link: string) => link.replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const page = bare(url);
  for (const row of rows) {
    for (const link of [row.job_link, row.agency_link]) {
      if (!link || !/^https?:/.test(link)) continue;
      if (linkInfo(link).key === key || page.startsWith(bare(link))) return row.id;
    }
  }
  return "";
}

function errorMessage(err: unknown): string {
  if (err instanceof CsvLockedError) {
    return "jobs.csv is open in another program (Excel?). Close it and try again.";
  }
  return err instanceof Error ? err.message : String(err);
}
