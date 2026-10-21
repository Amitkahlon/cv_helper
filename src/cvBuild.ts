import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";
import { jobJsonPath, type JobRecord } from "./add.js";
import type { AiProvider } from "./ai/provider.js";
import { arrayOf, object, STRING, STRINGS } from "./ai/schema.js";
import { loadConfig } from "./config.js";
import { cvText } from "./cvImport.js";
import { cvChoice, cvFileName, cvFilePath, loadCvs } from "./cvLibrary.js";
import { renderCvHtml, type TailoredContent } from "./cvTemplate.js";
import type { ChecklistItem, CvReport } from "./cvTypes.js";
import { readJobs, updateJob, type JobRow } from "./jobsCsv.js";
import { loadProfile } from "./profile.js";
import type { CvEntry, Profile, Role } from "./profileTypes.js";
import { fillRequirements, type Requirements } from "./requirements.js";
import { jobsCsvPath } from "./workspace.js";

// Phase 5: one CV per job, either a library CV ("predefined: <file>") or one
// tailored from the profile ("tailored: <role>"), plus a requirements checklist
// and a score (plan section 6).

export type { ChecklistItem, CvReport } from "./cvTypes.js";

const INT = { type: "integer" };
const CHECK = object({ id: STRING, status: { type: "string", enum: ["met", "partly", "not_met"] }, evidence: STRING });
const PICKED_ENTRIES = arrayOf(object({ index: INT, bullets: STRINGS }));

const TAILOR_SCHEMA = object({
  summary: STRING,
  experience: PICKED_ENTRIES,
  military_or_service: PICKED_ENTRIES,
  volunteering: PICKED_ENTRIES,
  projects: arrayOf(object({ index: INT, description: STRING })),
  education: arrayOf(object({ index: INT, notable_courses: STRINGS })),
  skills: arrayOf(object({ group: STRING, items: STRINGS })),
  certifications: arrayOf(INT),
  note: STRING,
  adapted: STRINGS,
  checklist: arrayOf(CHECK),
});

const TAILOR_SYSTEM = `You tailor a one-page CV to one job, using only the person's profile.
Honesty comes first:
- Use only facts in the profile. Never invent or inflate experience, skills, tools, numbers or results.
  If the job asks for something the profile lacks, leave it out of the CV and mark it not_met.
- You choose and word the content. Names, job titles, organizations, dates, contact details and links are
  filled in from the profile by the template: refer to profile entries only by their "index".
What to return:
- experience, military_or_service, volunteering: the entries worth including, newest first, each with 2-5
  bullets rewritten from that entry's facts to bring out what this job needs. Stay true to the facts.
- projects: the most relevant projects, each with one short sentence.
- education: every education entry; notable_courses only the ones relevant to the job.
- skills: groups of skills taken from the profile, most relevant first. Only skills the profile lists.
- certifications: indexes of the relevant ones.
- summary: 2-3 lines aimed at this job.
- It must fit on one page: about 450 words in all.
- note: one line saying what this CV leads with.
- adapted: 2-5 short notes on what you emphasised or changed for this job.
- checklist: one item per requirement id (R... and N...): met, partly or not_met, and evidence: the profile
  fact that covers it, or what is missing.
- Follow the person's own rules. Write in English unless their rules say otherwise.`;

const PREDEFINED_SCHEMA = object({ note: STRING, checklist: arrayOf(CHECK) });

const PREDEFINED_SYSTEM = `You compare a ready-made CV with a job's requirements.
- checklist: one item per requirement id (R... and N...): met, partly or not_met, judged only by what the CV
  text says, and evidence: the CV line that covers it, or what is missing.
- note: one line on how well the CV fits this job.`;

const CHOICE_SCHEMA = object({
  kind: { type: "string", enum: ["predefined", "tailored"] },
  cv_file: STRING,
  role: STRING,
  reason: STRING,
});

const CHOICE_SYSTEM = `You decide how a job seeker applies to one job.
- If one of their ready-made CVs clearly fits this job (by its category and what it's for), choose
  kind "predefined" and give its file.
- Otherwise choose kind "tailored" and the name of the target role that fits the job best ("" if none fits).
- reason: one short line.`;

// --- CV choice ---

export function parseChoice(choice: string): { kind: "predefined"; file: string } | { kind: "tailored"; role: string } | null {
  const predefined = choice.match(/^predefined:\s*(.+)$/);
  if (predefined) return { kind: "predefined", file: predefined[1].trim() };
  const tailored = choice.match(/^tailored:\s*(.*)$/);
  if (tailored) return { kind: "tailored", role: tailored[1].trim() };
  return null;
}

// Asks the AI which CV fits the job; answers with a cv_choice value.
export async function suggestCvChoice(
  ai: AiProvider,
  job: JobRecord,
  requirements: Requirements,
  roles: Role[],
  library: CvEntry[],
): Promise<string> {
  if (library.length === 0 && roles.length <= 1) return `tailored: ${roles[0]?.name ?? ""}`.trim();
  const prompt = [
    `Job: ${job.title} at ${job.company || "(company not given)"}`,
    `Field: ${requirements.field}; seniority: ${requirements.seniority}`,
    "Must have:",
    ...requirements.must_have.map((r) => `- ${r.text}`),
    "",
    "Ready-made CVs (JSON):",
    JSON.stringify(library.map(({ file, name, category, purpose }) => ({ file, name, category, purpose }))),
    "",
    "Target roles (JSON):",
    JSON.stringify(roles.map(({ name, fits }) => ({ name, fits }))),
  ].join("\n");
  const answer = await ai.generateJson<{ kind: string; cv_file: string; role: string }>({
    system: CHOICE_SYSTEM,
    prompt,
    schema: CHOICE_SCHEMA,
  });
  if (answer.kind === "predefined" && library.some((cv) => cv.file === answer.cv_file)) return cvChoice(answer.cv_file);
  const role = roles.find((r) => r.name === answer.role)?.name ?? "";
  return `tailored: ${role}`.trim();
}

// --- Validation (lesson 9.8) ---

// Keeps only entries that exist and skills the profile actually mentions;
// anything removed is reported as a warning.
export function validateContent(profile: Profile, raw: TailoredContent): { content: TailoredContent; warnings: string[] } {
  const warnings: string[] = [];
  const pick = <T extends { index: number }>(items: T[], list: unknown[]) => {
    const seen = new Set<number>();
    return (items ?? []).filter((item) => {
      const ok = Number.isInteger(item.index) && item.index >= 0 && item.index < list.length && !seen.has(item.index);
      seen.add(item.index);
      return ok;
    });
  };
  const bullets = (items: { index: number; bullets: string[] }[]) =>
    items.map((item) => ({ ...item, bullets: (item.bullets ?? []).map((b) => b.trim()).filter(Boolean) }));

  // Everything the profile says, minus preferences: a skill must appear somewhere in it.
  const { preferences, ...facts } = profile;
  const known = JSON.stringify(facts).toLowerCase();
  const skills = (raw.skills ?? [])
    .map((group) => ({
      group: group.group,
      items: (group.items ?? []).filter((skill) => {
        const found = known.includes(skill.trim().toLowerCase());
        if (!found) warnings.push(`Removed "${skill}" from the skills: it isn't in your profile.`);
        return found && skill.trim() !== "";
      }),
    }))
    .filter((group) => group.items.length > 0);

  return {
    content: {
      summary: (raw.summary ?? "").trim(),
      experience: bullets(pick(raw.experience, profile.experience)),
      military_or_service: bullets(pick(raw.military_or_service, profile.military_or_service)),
      volunteering: bullets(pick(raw.volunteering, profile.volunteering)),
      projects: pick(raw.projects, profile.projects),
      education: pick(raw.education, profile.education),
      skills,
      certifications: [...new Set(raw.certifications ?? [])].filter(
        (i) => Number.isInteger(i) && i >= 0 && i < profile.certifications.length,
      ),
    },
    warnings,
  };
}

// One checklist item per requirement, in order; ids the AI skipped count as not assessed.
export function completeChecklist(
  requirements: Requirements,
  answer: { id: string; status: string; evidence: string }[],
): ChecklistItem[] {
  const byId = new Map(answer.map((item) => [item.id, item]));
  return [...requirements.must_have, ...requirements.nice_to_have].map((r) => {
    const item = byId.get(r.id);
    const status = item && ["met", "partly", "not_met"].includes(item.status) ? (item.status as ChecklistItem["status"]) : "not_met";
    return { id: r.id, requirement: r.text, status, evidence: item?.evidence ?? "not assessed" };
  });
}

// Met must-haves over all must-haves, e.g. "3/5" (partly met doesn't count).
export function scoreOf(checklist: ChecklistItem[]): string {
  const must = checklist.filter((item) => item.id.startsWith("R"));
  return `${must.filter((item) => item.status === "met").length}/${must.length}`;
}

export function checklistMarkdown(job: JobRecord, report: CvReport): string {
  const mark = { met: "✅", partly: "🟡", not_met: "❌" };
  const lines = (prefix: string) => {
    const items = report.checklist.filter((item) => item.id.startsWith(prefix));
    return items.length ? items.map((item) => `- ${mark[item.status]} ${item.requirement} — ${item.evidence}`) : ["- (none)"];
  };
  const out = [`# ${job.title}${job.company ? ` — ${job.company}` : ""}`, "", `CV: ${report.choice} (${report.file})`];
  out.push(`Score: ${report.score} must-haves met`);
  if (report.note) out.push("", report.note);
  out.push("", "## Must have", ...lines("R"), "", "## Nice to have", ...lines("N"));
  if (report.adapted.length) out.push("", "## What was adapted", ...report.adapted.map((a) => `- ${a}`));
  if (report.warnings.length) out.push("", "## Warnings", ...report.warnings.map((w) => `- ${w}`));
  if (report.instructions) out.push("", `Instructions for this build: ${report.instructions}`);
  return out.join("\n") + "\n";
}

// --- Building ---

const FONT_SCALES = [1, 0.95, 0.9, 0.85];

// Renders the CV, shrinking the text a little until it fits on one page.
async function renderPdf(html: (scale: number) => string): Promise<{ pdf: Buffer; pages: number }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let result = { pdf: Buffer.alloc(0), pages: 0 };
    for (const scale of FONT_SCALES) {
      await page.setContent(html(scale), { waitUntil: "load" });
      const pdf = Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
      result = { pdf, pages: (await PDFDocument.load(pdf)).getPageCount() };
      if (result.pages <= 1) break;
    }
    return result;
  } finally {
    await browser.close();
  }
}

function tailorPrompt(
  profile: Profile,
  rules: string,
  role: Role | undefined,
  job: JobRecord,
  requirements: Requirements,
  instructions: string,
): string {
  const withIndex = <T extends object>(list: T[]) => list.map((item, index) => ({ index, ...item }));
  const indexed = {
    ...profile,
    experience: withIndex(profile.experience),
    projects: withIndex(profile.projects),
    education: withIndex(profile.education),
    certifications: withIndex(profile.certifications),
    military_or_service: withIndex(profile.military_or_service),
    volunteering: withIndex(profile.volunteering),
  };
  return [
    `The job: ${job.title} at ${job.company || "(company not given)"}, ${job.location || "location not given"}.`,
    "",
    "Its requirements (JSON):",
    JSON.stringify({ must_have: requirements.must_have, nice_to_have: requirements.nice_to_have, field: requirements.field }),
    "",
    "The full posting, for context:",
    job.description || "(none)",
    "",
    role ? `Target role: ${role.name}. Lead with: ${role.emphasis || "(no notes)"}` : "",
    instructions ? `The person's instructions for this CV: ${instructions}` : "",
    "",
    "The person's rules:",
    rules,
    "",
    "The profile (JSON; refer to entries by index):",
    JSON.stringify(indexed),
  ].join("\n");
}

async function buildTailored(
  workspace: string,
  ai: AiProvider,
  job: JobRecord,
  requirements: Requirements,
  roleName: string,
  instructions: string,
): Promise<CvReport> {
  const { profile, roles, rules, exists } = await loadProfile(workspace);
  if (!exists || !profile.personal.name) throw new Error("Set up your profile first (Profile tab)");
  const { cv: style } = await loadConfig(workspace);
  const role = roles.find((r) => r.name === roleName);

  let extra = instructions;
  for (let attempt = 1; ; attempt++) {
    const answer = await ai.generateJson<TailoredContent & { note: string; adapted: string[]; checklist: ChecklistItem[] }>({
      system: TAILOR_SYSTEM,
      prompt: tailorPrompt(profile, rules, role, job, requirements, extra),
      schema: TAILOR_SCHEMA,
    });
    const { content, warnings } = validateContent(profile, answer);
    const { pdf, pages } = await renderPdf((scale) => renderCvHtml(profile, content, style, scale));

    // Too long even with smaller text: ask once more for a shorter version.
    if (pages > 1 && attempt === 1) {
      extra = [instructions, `A first version ran to ${pages} pages. It must fit on one page: about 350 words, fewer entries and bullets.`]
        .filter(Boolean)
        .join("\n");
      continue;
    }
    if (pages > 1) warnings.push(`The CV is ${pages} pages long even after shortening.`);

    const file = await writeJobCv(workspace, job.id, profile.personal.name, ".pdf", pdf);
    const checklist = completeChecklist(requirements, answer.checklist ?? []);
    return {
      choice: `tailored: ${roleName}`.trim(),
      file,
      built_at: new Date().toISOString(),
      note: answer.note ?? "",
      adapted: answer.adapted ?? [],
      checklist,
      score: scoreOf(checklist),
      warnings,
      instructions: instructions || undefined,
      content,
    };
  }
}

async function buildPredefined(
  workspace: string,
  ai: AiProvider,
  job: JobRecord,
  requirements: Requirements,
  libraryFile: string,
): Promise<CvReport> {
  const source = cvFilePath(workspace, libraryFile);
  const content = await readFile(source);
  const text = await cvText(content, source);
  const { profile } = await loadProfile(workspace);
  const answer = await ai.generateJson<{ note: string; checklist: ChecklistItem[] }>({
    system: PREDEFINED_SYSTEM,
    prompt: [
      `The job: ${job.title} at ${job.company || "(company not given)"}.`,
      "Requirements (JSON):",
      JSON.stringify({ must_have: requirements.must_have, nice_to_have: requirements.nice_to_have }),
      "",
      "The CV text:",
      text,
    ].join("\n"),
    schema: PREDEFINED_SCHEMA,
  });
  const file = await writeJobCv(workspace, job.id, profile.personal.name, path.extname(source), content);
  const checklist = completeChecklist(requirements, answer.checklist ?? []);
  return {
    choice: cvChoice(libraryFile),
    file,
    built_at: new Date().toISOString(),
    note: answer.note ?? "",
    adapted: [],
    checklist,
    score: scoreOf(checklist),
    warnings: [],
  };
}

// Writes the CV into the job folder as <Name>_CV.<ext>; answers with its path relative to the workspace.
async function writeJobCv(workspace: string, id: string, personName: string, ext: string, content: Buffer): Promise<string> {
  const dir = path.join(workspace, "jobs", id);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, cvFileName(personName, ext));
  await writeFile(target, content);
  return path.relative(workspace, target).split(path.sep).join("/");
}

export function cvReportPath(workspace: string, id: string): string {
  return path.join(workspace, "jobs", id, "cv.json");
}

export async function loadCvReport(workspace: string, id: string): Promise<CvReport | null> {
  try {
    return JSON.parse(await readFile(cvReportPath(workspace, id), "utf8"));
  } catch {
    return null;
  }
}

async function findRow(workspace: string, id: string): Promise<JobRow> {
  const row = (await readJobs(jobsCsvPath(workspace))).rows.find((r) => r.id === id);
  if (!row) throw new Error(`No job with id ${id}`);
  return row;
}

// Builds (or rebuilds) the CV for one job: extracts requirements if missing,
// picks a CV choice if none is set, then builds and records cv_status, cv_file
// and score. On failure cv_status says "error: ...".
export async function buildCv(
  workspace: string,
  ai: AiProvider,
  id: string,
  options: { instructions?: string } = {},
): Promise<CvReport> {
  const csvPath = jobsCsvPath(workspace);
  try {
    let job: JobRecord;
    try {
      job = JSON.parse(await readFile(jobJsonPath(workspace, id), "utf8"));
    } catch {
      throw new Error("No details saved for this job, so there is nothing to build a CV from");
    }
    const requirements = (job.requirements as Requirements | null) ?? (await fillRequirements(workspace, ai, id));

    let choice = (await findRow(workspace, id)).cv_choice ?? "";
    if (!parseChoice(choice)) {
      const { roles } = await loadProfile(workspace);
      choice = await suggestCvChoice(ai, job, requirements, roles, await loadCvs(workspace));
      await updateJob(csvPath, id, { cv_choice: choice });
    }
    const parsed = parseChoice(choice)!;
    const instructions = (options.instructions ?? "").trim();
    const report =
      parsed.kind === "predefined"
        ? await buildPredefined(workspace, ai, job, requirements, parsed.file)
        : await buildTailored(workspace, ai, job, requirements, parsed.role, instructions);

    await writeFile(cvReportPath(workspace, id), JSON.stringify(report, null, 2) + "\n", "utf8");
    await writeFile(path.join(workspace, "jobs", id, "checklist.md"), checklistMarkdown(job, report), "utf8");
    await updateJob(csvPath, id, { cv_status: "built", cv_file: report.file, score: report.score });
    return report;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).split("\n")[0];
    await updateJob(csvPath, id, { cv_status: `error: ${message}` }).catch(() => {});
    throw err;
  }
}

// Jobs that should get a CV: not submitted, not filtered out, no CV yet, with saved details.
export async function jobsNeedingCv(workspace: string): Promise<string[]> {
  const ids: string[] = [];
  for (const row of (await readJobs(jobsCsvPath(workspace))).rows) {
    if ((row.submitted ?? "").trim() || (row.filter ?? "").trim() || (row.cv_status ?? "").trim()) continue;
    if (await exists(jobJsonPath(workspace, row.id))) ids.push(row.id);
  }
  return ids;
}

// The job's CV file, if it has one: a fresh copy of its chosen library CV (the
// choice may have changed), or the CV built for it.
export async function jobCvFile(workspace: string, id: string): Promise<string | null> {
  const row = await findRow(workspace, id);
  const parsed = parseChoice(row.cv_choice ?? "");
  if (parsed?.kind !== "predefined") {
    const built = row.cv_file ? path.join(workspace, row.cv_file) : "";
    return built && (await exists(built)) ? built : null;
  }
  const { profile } = await loadProfile(workspace);
  const source = cvFilePath(workspace, parsed.file);
  const target = path.join(workspace, "jobs", id, cvFileName(profile.personal.name, path.extname(source)));
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  await updateJob(jobsCsvPath(workspace), id, { cv_file: path.relative(workspace, target).split(path.sep).join("/") });
  return target;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
