import { useState } from "react";
import { ListEditor, ObjectEditor, type Field } from "./fields";
import { importCv, saveProfile, type Profile, type ProfileForm } from "./profileApi";
import { LIST_SECTIONS, PERSONAL_FIELDS, PREFERENCE_FIELDS, ROLE_FIELDS } from "./profileSections";
import { Wizard, type WizardStep } from "./Wizard";

const section = (key: string) => LIST_SECTIONS.find((s) => s.key === key)!;

// The profile walkthrough: goes through the profile one part at a time, on a
// copy of it. Nothing is saved until the last step's "Save profile".
export function ProfileWizard({
  initial,
  onSaved,
  onCancel,
}: {
  initial: ProfileForm;
  onSaved: (form: ProfileForm) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ProfileForm>(() => structuredClone(initial));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const p = draft.profile;
  const set = (key: keyof Profile, value: unknown) => setDraft({ ...draft, profile: { ...p, [key]: value } });

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

  const list = (key: string) => (
    <ListEditor
      fields={section(key).fields}
      items={(p as any)[key]}
      onChange={(items) => set(key as keyof Profile, items)}
      itemLabel={section(key).label}
    />
  );

  const steps: WizardStep[] = [
    {
      id: "details",
      title: "Details",
      intro: (
        <>
          How employers reach you. Starting from scratch? Import your current CV first: it fills every step, and you
          check each one as you go.
        </>
      ),
      render: () => (
        <>
          <label className="upload card">
            <b>Import a CV (PDF or DOCX)</b> <span className="hint">replaces the steps' content with what's in it</span>
            <br />
            <input
              type="file"
              accept=".pdf,.docx"
              disabled={!!busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) run("Reading your CV with AI (up to a minute)...", async () => setDraft({ ...draft, profile: await importCv(file) }));
              }}
            />
          </label>
          <ObjectEditor fields={PERSONAL_FIELDS} value={p.personal} onChange={(v) => set("personal", v)} />
        </>
      ),
    },
    {
      id: "experience",
      title: "Experience",
      intro: (
        <>
          One entry per job, newest first. Under "What you did", write facts, one per line, with numbers where you can:
          <i> "Cut the regression run from 3 hours to 25 minutes"</i> says more than <i>"Improved tests"</i>. Every CV is
          built only from what you write here.
        </>
      ),
      render: () => list("experience"),
    },
    {
      id: "projects",
      title: "Projects",
      intro: <>Personal, university or open-source projects: what it does, and the tools you used. Add a link if it's public.</>,
      render: () => list("projects"),
    },
    {
      id: "education",
      title: "Education",
      intro: <>Degrees and courses. Grades and notable courses are optional; add them if they help.</>,
      render: () => list("education"),
    },
    {
      id: "skills",
      title: "Skills",
      intro: <>Group your skills the way you'd like them on a CV, e.g. "Languages", "Testing", "Tools". Only list what you can talk about in an interview.</>,
      render: () => list("skills"),
    },
    {
      id: "more",
      title: "Languages & more",
      intro: <>Spoken languages, certifications, military or national service, volunteering, and anything else worth knowing.</>,
      render: () => (
        <>
          {["languages", "certifications", "military_or_service", "volunteering"].map((key) => (
            <section key={key}>
              <h3>{section(key).title}</h3>
              {list(key)}
            </section>
          ))}
          <h3>Other</h3>
          <ObjectEditor
            fields={[{ key: "other", label: "Anything else (one per line)", kind: "lines" } as Field]}
            value={{ other: p.other }}
            onChange={(v) => set("other", v.other)}
          />
        </>
      ),
    },
    {
      id: "preferences",
      title: "Preferences",
      intro: <>What you're looking for. Used to tune CVs now, and later to fill in application forms.</>,
      render: () => <ObjectEditor fields={PREFERENCE_FIELDS} value={p.preferences} onChange={(v) => set("preferences", v)} />,
    },
    {
      id: "roles",
      title: "Target roles",
      intro: (
        <>
          The kinds of jobs you apply for, e.g. "QA automation" and "Backend developer". For each job the AI picks the
          matching role and tailors your CV with its emphasis. Ready-made CVs for a role go in the CVs tab, with the
          role's name as their category.
        </>
      ),
      render: () => (
        <ListEditor
          fields={ROLE_FIELDS}
          items={draft.roles}
          onChange={(roles) => setDraft({ ...draft, roles: roles as ProfileForm["roles"] })}
          itemLabel={(r) => r.name}
        />
      ),
    },
    {
      id: "review",
      title: "Review",
      intro: <>Check what's in your profile. Go back to any step from the tabs above. Nothing is saved until you press Save profile.</>,
      render: () => <Review draft={draft} />,
    },
  ];

  return (
    <>
      {error && <p className="error">{error}</p>}
      <Wizard
        title="Profile walkthrough"
        steps={steps}
        finishLabel="Save profile"
        busy={busy}
        onCancel={() => {
          if (JSON.stringify(draft) === JSON.stringify(initial) || confirm("Leave the walkthrough? Your changes in it are not saved.")) onCancel();
        }}
        onFinish={() =>
          run("Saving...", async () => {
            const saved = await saveProfile(draft);
            onSaved({ profile: saved.profile, roles: saved.roles, rules: saved.rules });
          })
        }
      />
    </>
  );
}

// What the profile holds, and what's missing that CVs need.
function Review({ draft }: { draft: ProfileForm }) {
  const p = draft.profile;
  const counts: [string, number][] = [
    ["jobs", p.experience.length],
    ["projects", p.projects.length],
    ["education entries", p.education.length],
    ["skill groups", p.skills.length],
    ["languages", p.languages.length],
    ["target roles", draft.roles.length],
  ];
  const missing = [
    !p.personal.name && "your name",
    !p.personal.email && !p.personal.phone && "an email or phone number",
    p.experience.length + p.projects.length === 0 && "at least one job or project",
    p.experience.some((e) => e.facts.length === 0) && "facts for every job (what you did)",
    draft.roles.length === 0 && "a target role (optional, but it helps the AI tailor CVs)",
  ].filter(Boolean);
  return (
    <>
      <div className="stats">
        {counts.map(([label, n]) => (
          <div key={label} className="stat">
            <b>{n}</b>
            {label}
          </div>
        ))}
      </div>
      {missing.length > 0 ? (
        <div className="card">
          <b>Still missing</b>
          <ul>
            {missing.map((m) => (
              <li key={String(m)}>{m}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="ok">Everything a CV needs is there.</p>
      )}
    </>
  );
}
