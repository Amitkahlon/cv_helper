// The user's CV rules, as answered in the rules walkthrough (profile/rules.yaml),
// and how they become profile/rules.md, the text the AI follows when it builds
// CVs. No imports with runtime code, so the UI can show the same preview.

export interface CvRules {
  honesty: string[]; // more honesty rules, besides the built-in "never claim what isn't true"
  pages: number; // 1 or 2
  summary_length: string; // e.g. "2-4 lines"
  bullets_per_job: string; // e.g. "4-5 for the main job, 2-3 for the others"
  projects: string; // e.g. "3-5 projects, one or two lines each"
  language: string; // e.g. "English", "the posting's language"
  summary_style: string; // e.g. "Name a job type, never the exact job title"
  skill_framing: { skill: string; rule: string }[]; // how to describe specific skills honestly
  role_rules: { role: string; include: string; leave_out: string; section_order: string }[];
  education: string; // e.g. "No graduation year; present the degree as completed"
  special_cases: string[]; // e.g. "Mention security clearance only for defense jobs"
  other: string[];
  skip_jobs: string[]; // kinds of jobs not worth a CV
}

export const CORE_HONESTY =
  "Never claim a skill, tool or experience that isn't in the profile, and never exaggerate. If the job asks for something missing, list it as a gap in the checklist instead.";

export function cleanRules(r: any): CvRules {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const list = <T extends object>(v: unknown, clean: (x: any) => T) =>
    Array.isArray(v) ? v.map(clean).filter((x) => Object.values(x).some((y) => y !== "")) : [];
  const pages = Number(r?.pages);
  return {
    honesty: strs(r?.honesty),
    pages: pages === 2 ? 2 : 1,
    summary_length: str(r?.summary_length),
    bullets_per_job: str(r?.bullets_per_job),
    projects: str(r?.projects),
    language: str(r?.language) || "English",
    summary_style: str(r?.summary_style),
    skill_framing: list(r?.skill_framing, (x) => ({ skill: str(x?.skill), rule: str(x?.rule) })),
    role_rules: list(r?.role_rules, (x) => ({
      role: str(x?.role),
      include: str(x?.include),
      leave_out: str(x?.leave_out),
      section_order: str(x?.section_order),
    })),
    education: str(r?.education),
    special_cases: strs(r?.special_cases),
    other: strs(r?.other),
    skip_jobs: strs(r?.skip_jobs),
  };
}

// rules.md: numbered, grouped rules the AI reads with every CV it builds.
export function rulesMarkdown(rules: CvRules): string {
  const out: string[] = ["# Rules for my CVs", ""];
  const section = (title: string, lines: string[]) => {
    const kept = lines.filter(Boolean);
    if (kept.length) out.push(`## ${title}`, "", ...kept.map((line) => (line.startsWith("### ") || line.startsWith("- ") ? line : `- ${line}`)), "");
  };

  section("Honesty (never break)", [CORE_HONESTY, ...rules.honesty]);
  section("Length", [
    `${rules.pages} page${rules.pages === 2 ? "s" : ""}: be selective, relevance over completeness.`,
    rules.summary_length && `Summary: ${rules.summary_length}.`,
    rules.bullets_per_job && `Bullets per job: ${rules.bullets_per_job}.`,
    rules.projects && `Projects: ${rules.projects}.`,
  ]);
  section("Language", [`Write the CV in ${rules.language.replace(/\.$/, "")}.`]);
  section("Summary", [rules.summary_style]);
  section(
    "How to describe these skills",
    rules.skill_framing.map((f) => `**${f.skill || "?"}**: ${f.rule}`),
  );
  const roles: string[] = [];
  for (const r of rules.role_rules) {
    roles.push(`### ${r.role || "Other jobs"}`);
    if (r.include) roles.push(`- Include: ${r.include}`);
    if (r.leave_out) roles.push(`- Leave out: ${r.leave_out}`);
    if (r.section_order) roles.push(`- Section order: ${r.section_order}`);
  }
  section("By kind of job", roles);
  section("Education", [rules.education]);
  section("Special cases", rules.special_cases);
  section("Other", rules.other);
  section("Jobs not worth a CV (say so in the checklist instead of tailoring)", rules.skip_jobs);
  return out.join("\n").trimEnd() + "\n";
}
