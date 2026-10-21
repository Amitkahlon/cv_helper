import { useEffect, useState } from "react";
import { cleanRules, CORE_HONESTY, rulesMarkdown } from "../../src/rulesText";
import { FieldInput, ListEditor, ObjectEditor, type Field } from "./fields";
import { fetchRules, importRules, saveRules, type CvRules } from "./profileApi";
import { Wizard, type WizardStep } from "./Wizard";

// The CV rules walkthrough: the rules the AI follows whenever it builds a CV,
// asked one topic at a time, with examples. Saves profile/rules.md at the end.

const LANGUAGES = ["English", "the same language as the job posting", "Hebrew"];

export function RulesWizard({
  roles,
  onSaved,
  onCancel,
}: {
  roles: string[]; // target role names, offered for per-role rules
  onSaved: (rulesText: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CvRules | null>(null);
  const [existing, setExisting] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // Start from the last walkthrough's answers, or from defaults.
  useEffect(() => {
    fetchRules().then(
      (rules) => setDraft(rules ?? cleanRules({ role_rules: roles.map((role) => ({ role })) })),
      (err) => setError(String(err)),
    );
  }, []);

  if (!draft) return error ? <p className="error">{error}</p> : <p>Loading...</p>;
  const set = <K extends keyof CvRules>(key: K, value: CvRules[K]) => setDraft({ ...draft, [key]: value });

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  // A list of plain lines, edited one per line.
  const lines = (key: "honesty" | "special_cases" | "other" | "skip_jobs", label: string) => (
    <FieldInput
      field={{ key, label, kind: "lines" }}
      value={draft[key]}
      onChange={(value: string[]) => set(key, value)}
    />
  );
  const text = (key: keyof CvRules, label: string, placeholder = "", long = false) => (
    <label className="field">
      <span>{label}</span>
      {long ? (
        <textarea dir="auto" rows={3} placeholder={placeholder} value={String(draft[key])} onChange={(e) => set(key, e.target.value as never)} />
      ) : (
        <input dir="auto" placeholder={placeholder} value={String(draft[key])} onChange={(e) => set(key, e.target.value as never)} />
      )}
    </label>
  );

  const steps: WizardStep[] = [
    {
      id: "start",
      title: "Start",
      intro: (
        <>
          Rules are what the AI follows every time it builds one of your CVs: how long, in which language, how to
          describe tricky skills, what to leave out for some jobs. The next steps ask one topic at a time. Already have
          rules written somewhere (notes, an old prompt)? Paste them here and the AI fills in the steps for you to check.
        </>
      ),
      render: () => (
        <>
          <label className="field">
            <span>Your existing rules (optional)</span>
            <textarea dir="auto" rows={10} value={existing} onChange={(e) => setExisting(e.target.value)} placeholder={"e.g.\n- One page, English only.\n- C++: never claim experience; say \"actively learning C++\".\n- QA jobs: leave out the web projects."} />
          </label>
          <p>
            <button
              className="primary"
              disabled={!existing.trim() || !!busy}
              onClick={() => run("Reading your rules with AI...", async () => setDraft(await importRules(existing)))}
            >
              Fill the steps from these rules
            </button>{" "}
            <span className="hint">or press Next to answer the steps yourself.</span>
          </p>
        </>
      ),
    },
    {
      id: "honesty",
      title: "Honesty",
      intro: <>This rule is always on and can't be removed. Add your own on top, e.g. tools that didn't exist yet at an old job.</>,
      render: () => (
        <>
          <div className="card">✔ {CORE_HONESTY}</div>
          {lines("honesty", "More honesty rules (one per line)")}
          <p className="hint">Example: "Don't mention AI coding tools in jobs before 2023: they didn't exist then."</p>
        </>
      ),
    },
    {
      id: "length",
      title: "Length",
      intro: <>How much goes on the CV. Being selective usually beats being complete.</>,
      render: () => (
        <div className="fields">
          <label className="field">
            <span>Pages</span>
            <select value={draft.pages} onChange={(e) => set("pages", Number(e.target.value))}>
              <option value={1}>1 page</option>
              <option value={2}>2 pages</option>
            </select>
          </label>
          {text("summary_length", "Summary length", "e.g. 2-4 lines")}
          {text("bullets_per_job", "Bullets per job", "e.g. 4-5 for the latest job, 2-3 for older ones")}
          {text("projects", "Projects", "e.g. 3-5, one or two lines each, most relevant first")}
        </div>
      ),
    },
    {
      id: "language",
      title: "Language & summary",
      intro: <>The language of your CVs, and how the summary at the top should read.</>,
      render: () => (
        <div className="fields">
          <label className="field">
            <span>Write CVs in</span>
            <select
              value={LANGUAGES.includes(draft.language) ? draft.language : "other"}
              onChange={(e) => set("language", e.target.value === "other" ? "" : e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="other">Other…</option>
            </select>
          </label>
          {!LANGUAGES.includes(draft.language) && text("language", "Other language", "e.g. German")}
          {text("summary_style", "How the summary should read", 'e.g. Short. Name a kind of job ("a QA automation role"), never the exact job title.', true)}
        </div>
      ),
    },
    {
      id: "skills",
      title: "Tricky skills",
      intro: (
        <>
          Skills that need careful wording: ones you're learning, used only a little, or that are easy to overstate.
          Examples: <i>C++ → "never claim experience; say 'strong C background, actively learning C++'"</i>, <i>Python → "scripting
          and personal projects; never call it my main professional language"</i>.
        </>
      ),
      render: () => (
        <ListEditor
          fields={[
            { key: "skill", label: "Skill" },
            { key: "rule", label: "How it may (and may not) be described", kind: "long" },
          ]}
          items={draft.skill_framing}
          onChange={(items) => set("skill_framing", items as CvRules["skill_framing"])}
          itemLabel={(f) => f.skill}
        />
      ),
    },
    {
      id: "roles",
      title: "By kind of job",
      intro: (
        <>
          What changes between kinds of jobs: what to include or leave out, and the order of the sections (experience,
          projects, education, skills, military_or_service, volunteering, certifications, languages). Example: Student
          jobs → section order "education, projects, experience, skills".
        </>
      ),
      render: () => (
        <>
          <datalist id="role-names">
            {roles.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <ListEditor
            fields={ROLE_RULE_FIELDS}
            items={draft.role_rules}
            onChange={(items) => set("role_rules", items as CvRules["role_rules"])}
            itemLabel={(r) => r.role}
          />
        </>
      ),
    },
    {
      id: "special",
      title: "Education & special cases",
      intro: <>How to present your education, and extras that only apply sometimes.</>,
      render: () => (
        <>
          <div className="fields">{text("education", "Education", 'e.g. No graduation year; present the degree as completed. For student jobs write "Final year".', true)}</div>
          {lines("special_cases", "Special cases (one per line)")}
          <p className="hint">Examples: "Mention my security clearance only for defense jobs", "Attach my grade sheet only when the job asks for it".</p>
          {lines("other", "Other rules (one per line)")}
        </>
      ),
    },
    {
      id: "skip",
      title: "Jobs to skip",
      intro: (
        <>
          Kinds of jobs not worth a CV, e.g. "Native mobile (Swift, Kotlin)" or "5+ years of experience required". The AI
          notes these in the checklist. Add words below to also hide such jobs automatically with the job filters.
        </>
      ),
      render: () => (
        <>
          {lines("skip_jobs", "Jobs to skip (one per line)")}
          <ObjectEditor
            fields={[{ key: "keywords", label: "Also hide jobs mentioning these words (comma separated, e.g. FPGA, SystemVerilog)", kind: "list" }]}
            value={{ keywords: keywords ? keywords.split(",") : [] }}
            onChange={(v) => setKeywords((v.keywords as string[]).join(","))}
          />
        </>
      ),
    },
    {
      id: "review",
      title: "Review",
      intro: <>This is the text the AI will follow. Saving replaces your current rules.md.</>,
      render: () => <pre className="card rules-preview">{rulesMarkdown(cleanRules(draft))}</pre>,
    },
  ];

  return (
    <>
      {error && <p className="error">{error}</p>}
      <Wizard
        title="CV rules walkthrough"
        steps={steps}
        finishLabel="Save rules"
        busy={busy}
        onCancel={() => confirm("Leave the rules walkthrough? Your answers in it are not saved.") && onCancel()}
        onFinish={() =>
          run("Saving...", async () => {
            const saved = await saveRules(draft, keywords.split(",").map((k) => k.trim()).filter(Boolean));
            onSaved(rulesMarkdown(saved));
          })
        }
      />
    </>
  );
}

const ROLE_RULE_FIELDS: Field[] = [
  { key: "role", label: "Kind of job (e.g. a target role)", suggestions: "role-names" },
  { key: "include", label: "Include / lead with", kind: "long" },
  { key: "leave_out", label: "Leave out", kind: "long" },
  { key: "section_order", label: "Section order (comma separated)" },
];
