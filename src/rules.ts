import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { AiProvider } from "./ai/provider.js";
import { arrayOf, object, STRING, STRINGS } from "./ai/schema.js";
import { loadConfig, saveConfig } from "./config.js";
import { profileDir } from "./profile.js";
import { cleanRules, rulesMarkdown, type CvRules } from "./rulesText.js";

// The rules walkthrough's answers live in profile/rules.yaml; what the AI reads
// is profile/rules.md, generated from them (and still editable by hand).

const RULES_SCHEMA = object({
  honesty: STRINGS,
  pages: { type: "integer" },
  summary_length: STRING,
  bullets_per_job: STRING,
  projects: STRING,
  language: STRING,
  summary_style: STRING,
  skill_framing: arrayOf(object({ skill: STRING, rule: STRING })),
  role_rules: arrayOf(object({ role: STRING, include: STRING, leave_out: STRING, section_order: STRING })),
  education: STRING,
  special_cases: STRINGS,
  other: STRINGS,
  skip_jobs: STRINGS,
});

const IMPORT_SYSTEM = `You turn someone's existing rules for their CVs (free text, maybe mixed with facts about
them) into structured rules. Keep their meaning and wording; don't add rules they didn't write.
- honesty: extra honesty rules only. Leave out the general "don't lie / don't exaggerate / list gaps"
  rule (it is always included anyway) and rules about one specific skill (those go in skill_framing).
  Each rule goes in exactly one place.
- pages (1 or 2), summary_length, bullets_per_job, projects: length budgets.
- language: the language CVs are written in, e.g. "English" or "the same language as the job posting".
- summary_style: how the summary should be written.
- skill_framing: specific skills with how they may or may not be described.
- role_rules: per kind of job: what to include, what to leave out, and the section order.
- education: how education is presented.
- special_cases: conditional extras (e.g. security clearance only for defense jobs, transcript only when asked).
- other: rules that fit nowhere else (e.g. where certain content may appear).
- skip_jobs: kinds of jobs they don't want to apply to.
Ignore facts about the person (jobs, projects, skills lists): those belong in their profile, not in rules.
Use "" or [] when the text says nothing about something.`;

const yamlPath = (workspace: string) => path.join(profileDir(workspace), "rules.yaml");

// The saved walkthrough answers, or null if the walkthrough hasn't been used yet.
export async function loadRules(workspace: string): Promise<CvRules | null> {
  try {
    return cleanRules(YAML.parse(await readFile(yamlPath(workspace), "utf8")));
  } catch {
    return null;
  }
}

// Saves the answers and rules.md. `skipKeywords` are also added to the job
// filters' "reject jobs mentioning" list.
export async function saveRules(workspace: string, rules: unknown, skipKeywords: string[] = []): Promise<CvRules> {
  const cleaned = cleanRules(rules);
  await mkdir(profileDir(workspace), { recursive: true });
  await writeFile(yamlPath(workspace), "# Answers from the CV rules walkthrough; rules.md is made from these.\n" + YAML.stringify(cleaned), "utf8");
  await writeFile(path.join(profileDir(workspace), "rules.md"), rulesMarkdown(cleaned), "utf8");
  const words = skipKeywords.map((w) => w.trim()).filter(Boolean);
  if (words.length) {
    const config = await loadConfig(workspace);
    const keywords = [...new Set([...config.filters.reject_keywords, ...words])];
    await saveConfig(workspace, { ...config, filters: { ...config.filters, reject_keywords: keywords } });
  }
  return cleaned;
}

// Structured rules from someone's existing rules text (a draft to review).
export async function importRules(ai: AiProvider, text: string): Promise<CvRules> {
  const answer = await ai.generateJson<unknown>({ system: IMPORT_SYSTEM, prompt: text, schema: RULES_SCHEMA });
  return cleanRules(answer);
}
