import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { Education, Entry, Profile, ProfileData, Project, Role } from "./profileTypes.js";

export const DEFAULT_RULES = `# Rules for your CVs

- Never claim a skill, tool or experience that isn't in profile.yaml; list gaps in the checklist instead.
- Keep names, job titles, dates, contact details and links exactly as in profile.yaml.
- One page.
`;

export function profileDir(workspace: string): string {
  return path.join(workspace, "profile");
}

export function emptyProfile(): Profile {
  return cleanProfile({});
}

export async function loadProfile(workspace: string): Promise<ProfileData> {
  const dir = profileDir(workspace);
  const profileText = await readIfExists(path.join(dir, "profile.yaml"));
  const rolesText = await readIfExists(path.join(dir, "roles.yaml"));
  const rules = await readIfExists(path.join(dir, "rules.md"));
  return {
    profile: cleanProfile(profileText ? YAML.parse(profileText) : {}),
    roles: cleanRoles(rolesText ? YAML.parse(rolesText)?.roles : []),
    rules: rules ?? DEFAULT_RULES,
    exists: profileText !== undefined,
  };
}

export async function saveProfile(
  workspace: string,
  data: { profile: unknown; roles: unknown; rules: unknown },
): Promise<ProfileData> {
  const dir = profileDir(workspace);
  await mkdir(dir, { recursive: true });
  const profile = cleanProfile(data.profile);
  const roles = cleanRoles(data.roles);
  const rules = typeof data.rules === "string" ? data.rules : DEFAULT_RULES;
  await writeFile(
    path.join(dir, "profile.yaml"),
    "# Your facts. CVs are built only from what is here: everything true, nothing else.\n" +
      YAML.stringify(profile),
    "utf8",
  );
  await writeFile(
    path.join(dir, "roles.yaml"),
    "# Target roles: the kinds of jobs you apply for.\n" + YAML.stringify({ roles }),
    "utf8",
  );
  await writeFile(path.join(dir, "rules.md"), rules, "utf8");
  return { profile, roles, rules, exists: true };
}

// Makes any parsed YAML or AI answer into a complete Profile: missing fields
// become "" or [], strings are trimmed, and empty list items are dropped.
export function cleanProfile(p: any): Profile {
  return {
    personal: {
      name: str(p?.personal?.name),
      email: str(p?.personal?.email),
      phone: str(p?.personal?.phone),
      city: str(p?.personal?.city),
      links: strs(p?.personal?.links),
      summary: str(p?.personal?.summary),
    },
    experience: list(p?.experience, entry),
    projects: list(p?.projects, project),
    education: list(p?.education, education),
    skills: list(p?.skills, (s) => ({ group: str(s?.group), items: strs(s?.items) })),
    certifications: list(p?.certifications, (c) => ({
      name: str(c?.name),
      issuer: str(c?.issuer),
      date: str(c?.date),
    })),
    languages: list(p?.languages, (l) => ({ language: str(l?.language), level: str(l?.level) })),
    military_or_service: list(p?.military_or_service, entry),
    volunteering: list(p?.volunteering, entry),
    other: strs(p?.other),
    preferences: {
      seniority: strs(p?.preferences?.seniority),
      locations: strs(p?.preferences?.locations),
      work_model: strs(p?.preferences?.work_model),
      job_types: strs(p?.preferences?.job_types),
      notes: str(p?.preferences?.notes),
    },
  };
}

export function cleanRoles(roles: unknown): Role[] {
  return list(roles, (r) => ({
    name: str(r?.name),
    fits: str(r?.fits),
    emphasis: str(r?.emphasis),
    cv_file: str(r?.cv_file),
  }));
}

function entry(e: any): Entry {
  return {
    role: str(e?.role),
    organization: str(e?.organization),
    start: str(e?.start),
    end: str(e?.end),
    location: str(e?.location),
    facts: strs(e?.facts),
    skills: strs(e?.skills),
  };
}

function project(p: any): Project {
  return { name: str(p?.name), link: str(p?.link), description: str(p?.description), skills: strs(p?.skills) };
}

function education(e: any): Education {
  return {
    degree: str(e?.degree),
    institution: str(e?.institution),
    start: str(e?.start),
    end: str(e?.end),
    grade: str(e?.grade),
    notable_courses: strs(e?.notable_courses),
  };
}

// YAML turns "2022" into a number, so numbers count as text too.
function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function strs(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter(Boolean) : [];
}

// Cleans each item and drops the ones left completely empty.
function list<T extends object>(value: unknown, clean: (item: any) => T): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(clean)
    .filter((item) => Object.values(item).some((v) => (Array.isArray(v) ? v.length > 0 : v !== "")));
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

// An uploaded file's name made safe for the profile folder: ASCII letters,
// digits, space, ".", "_", "-" only (lesson 9.6), and no folders.
export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  const ext = path.extname(base);
  const stem = base
    .slice(0, base.length - ext.length)
    .replace(/[^A-Za-z0-9 ._-]/g, "_")
    .replace(/[_ ]*_[_ ]*/g, "_") // "_ _ _" from a run of Hebrew words -> one "_"
    .replace(/^[_ .]+|[_ .]+$/g, "");
  return (stem || "file") + ext.replace(/[^A-Za-z0-9.]/g, "").toLowerCase();
}
