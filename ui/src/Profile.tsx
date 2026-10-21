import { useEffect, useState } from "react";
import { ListEditor, ObjectEditor, Questions, type Field } from "./fields";
import {
  askQuestions,
  fetchProfile,
  importCv,
  saveProfile,
  uploadRoleCv,
  type ProfileForm,
  type ProfileQuestion,
} from "./profileApi";

const ENTRY_FIELDS: Field[] = [
  { key: "role", label: "Role / job title" },
  { key: "organization", label: "Organization" },
  { key: "start", label: "Start (e.g. 2022-03)" },
  { key: "end", label: "End (or 'present')" },
  { key: "location", label: "Location" },
  { key: "facts", label: "What you did and achieved (one per line)", kind: "lines" },
  { key: "skills", label: "Skills and tools used (comma separated)", kind: "list" },
];

// The list sections of the profile, in page order.
const LIST_SECTIONS: { key: string; title: string; fields: Field[]; label: (item: any) => string }[] = [
  { key: "experience", title: "Experience", fields: ENTRY_FIELDS, label: (e) => [e.role, e.organization].filter(Boolean).join(" — ") },
  {
    key: "projects",
    title: "Projects",
    fields: [
      { key: "name", label: "Name" },
      { key: "link", label: "Link" },
      { key: "description", label: "Description", kind: "long" },
      { key: "skills", label: "Skills and tools used (comma separated)", kind: "list" },
    ],
    label: (p) => p.name,
  },
  {
    key: "education",
    title: "Education",
    fields: [
      { key: "degree", label: "Degree / course" },
      { key: "institution", label: "Institution" },
      { key: "start", label: "Start" },
      { key: "end", label: "End" },
      { key: "grade", label: "Grade" },
      { key: "notable_courses", label: "Notable courses (comma separated)", kind: "list" },
    ],
    label: (e) => [e.degree, e.institution].filter(Boolean).join(" — "),
  },
  {
    key: "skills",
    title: "Skills",
    fields: [
      { key: "group", label: "Group (e.g. Languages, Tools)" },
      { key: "items", label: "Skills (comma separated)", kind: "list" },
    ],
    label: (s) => s.group,
  },
  {
    key: "certifications",
    title: "Certifications",
    fields: [
      { key: "name", label: "Name" },
      { key: "issuer", label: "Issuer" },
      { key: "date", label: "Date" },
    ],
    label: (c) => c.name,
  },
  {
    key: "languages",
    title: "Languages",
    fields: [
      { key: "language", label: "Language" },
      { key: "level", label: "Level (e.g. native, fluent)" },
    ],
    label: (l) => l.language,
  },
  { key: "military_or_service", title: "Military / national service", fields: ENTRY_FIELDS, label: (e) => e.role },
  { key: "volunteering", title: "Volunteering", fields: ENTRY_FIELDS, label: (e) => [e.role, e.organization].filter(Boolean).join(" — ") },
];

const PERSONAL_FIELDS: Field[] = [
  { key: "name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "links", label: "Links: LinkedIn, portfolio, GitHub... (one per line)", kind: "lines" },
  { key: "summary", label: "Summary", kind: "long" },
];

const PREFERENCE_FIELDS: Field[] = [
  { key: "seniority", label: "Seniority (comma separated, e.g. junior, mid)", kind: "list" },
  { key: "locations", label: "Locations (comma separated)", kind: "list" },
  { key: "work_model", label: "Work model (comma separated: onsite, hybrid, remote)", kind: "list" },
  { key: "job_types", label: "Job types (comma separated, e.g. full-time)", kind: "list" },
  { key: "notes", label: "Anything else", kind: "long" },
];

const ROLE_FIELDS: Field[] = [
  { key: "name", label: "Role name (e.g. QA automation)" },
  { key: "fits", label: "Which jobs it fits" },
  { key: "emphasis", label: "What to lead with when tailoring a CV for it", kind: "long" },
];

export function ProfilePage() {
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saved, setSaved] = useState(""); // the form as last saved, to spot unsaved changes
  const [questions, setQuestions] = useState<ProfileQuestion[]>([]);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProfile().then(
      ({ profile, roles, rules, exists }) => {
        const loaded = { profile, roles, rules };
        setForm(loaded);
        setSaved(JSON.stringify(loaded));
        if (!exists) setStatus("No profile yet: import your CV to start, or fill the sections below.");
      },
      (err) => setError(String(err)),
    );
  }, []);

  if (!form) return error ? <p className="error">{error}</p> : <p>Loading...</p>;
  const dirty = JSON.stringify(form) !== saved;

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

  const save = () =>
    run("Saving...", async () => {
      const { profile, roles, rules } = await saveProfile(form);
      const cleaned = { profile, roles, rules };
      setForm(cleaned);
      setSaved(JSON.stringify(cleaned));
      setStatus("Saved.");
    });

  const importFile = (file: File) =>
    run("Reading your CV with AI (up to a minute)...", async () => {
      const draft = await importCv(file);
      setForm({ ...form, profile: draft });
      setQuestions([]);
      setStatus(`Imported from ${file.name}. Review every section, then press Save.`);
    });

  const ask = () =>
    run("Asking AI what's missing...", async () => {
      setQuestions(await askQuestions(form.profile, form.roles));
      setStatus("Questions are shown in yellow next to the section they're about. Answer them in the fields.");
    });

  const sectionQuestions = (key: string) =>
    questions.filter((q) => q.section === key && q.entry === null).map((q) => q.question);
  const entryQuestions = (key: string) => (index: number) =>
    questions.filter((q) => q.section === key && q.entry === index).map((q) => q.question);
  const setProfile = (key: string, value: unknown) => setForm({ ...form, profile: { ...form.profile, [key]: value } });

  return (
    <div className="profile">
      <div className="toolbar">
        <button onClick={save} disabled={!!busy || !dirty}>
          Save
        </button>
        <button onClick={ask} disabled={!!busy}>
          Ask AI what's missing
        </button>
        <label className="upload">
          Import CV (PDF or DOCX):{" "}
          <input
            type="file"
            accept=".pdf,.docx"
            disabled={!!busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file && (!dirty || confirm("Replace the unsaved changes in the form with the imported CV?"))) {
                importFile(file);
              }
            }}
          />
        </label>
        <span>
          {busy ||
            (dirty
              ? [status !== "Saved." && status, "Unsaved changes"].filter(Boolean).join(" · ")
              : status)}
        </span>
      </div>
      {error && <p className="error">{error}</p>}

      <h2>Personal</h2>
      <Questions questions={sectionQuestions("personal")} />
      <ObjectEditor fields={PERSONAL_FIELDS} value={form.profile.personal} onChange={(v) => setProfile("personal", v)} />

      {LIST_SECTIONS.map((section) => (
        <section key={section.key}>
          <h2>{section.title}</h2>
          <Questions questions={sectionQuestions(section.key)} />
          <ListEditor
            fields={section.fields}
            items={(form.profile as any)[section.key]}
            onChange={(items) => setProfile(section.key, items)}
            itemLabel={section.label}
            entryQuestions={entryQuestions(section.key)}
          />
        </section>
      ))}

      <h2>Other</h2>
      <Questions questions={sectionQuestions("other")} />
      <ObjectEditor
        fields={[{ key: "other", label: "Anything else worth knowing (one per line)", kind: "lines" }]}
        value={{ other: form.profile.other }}
        onChange={(v) => setProfile("other", v.other)}
      />

      <h2>Job preferences</h2>
      <Questions questions={sectionQuestions("preferences")} />
      <ObjectEditor
        fields={PREFERENCE_FIELDS}
        value={form.profile.preferences}
        onChange={(v) => setProfile("preferences", v)}
      />

      <h2>Target roles</h2>
      <p className="hint">
        The kinds of jobs you apply for. For each job, the AI picks the matching role and either uses its
        predefined CV or tailors one with its emphasis.
      </p>
      <Questions questions={sectionQuestions("roles")} />
      <ListEditor
        fields={ROLE_FIELDS}
        items={form.roles}
        onChange={(roles) => setForm({ ...form, roles: roles as ProfileForm["roles"] })}
        itemLabel={(r) => r.name}
        entryQuestions={entryQuestions("roles")}
        extra={(role, update) => (
          <div className="field">
            <span>Predefined CV (optional){role.cv_file ? `: ${role.cv_file}` : ""}</span>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) run("Uploading...", async () => update({ ...role, cv_file: await uploadRoleCv(file) }));
              }}
            />
            {role.cv_file && <button onClick={() => update({ ...role, cv_file: "" })}>Don't use a predefined CV</button>}
          </div>
        )}
      />

      <h2>Rules for your CVs</h2>
      <textarea
        className="rules"
        rows={8}
        value={form.rules}
        onChange={(e) => setForm({ ...form, rules: e.target.value })}
      />
    </div>
  );
}
