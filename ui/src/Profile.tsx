import { useEffect, useState } from "react";
import { ListEditor, ObjectEditor } from "./fields";
import { fetchProfile, importCv, saveProfile, type ProfileForm } from "./profileApi";
import { LIST_SECTIONS, PERSONAL_FIELDS, PREFERENCE_FIELDS, ROLE_FIELDS } from "./profileSections";
import { ProfileWizard } from "./ProfileWizard";
import { RulesWizard } from "./RulesWizard";

// The Profile tab: two walkthroughs (profile, CV rules) and the full editor.
export function ProfilePage() {
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saved, setSaved] = useState(""); // the form as last saved, to spot unsaved changes
  const [mode, setMode] = useState<"edit" | "profile-wizard" | "rules-wizard">("edit");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProfile().then(
      ({ profile, roles, rules, exists }) => {
        const loaded = { profile, roles, rules };
        setForm(loaded);
        setSaved(JSON.stringify(loaded));
        if (!exists) setStatus("No profile yet: start with the profile walkthrough above.");
      },
      (err) => setError(String(err)),
    );
  }, []);

  if (!form) return error ? <p className="error">{error}</p> : <p>Loading...</p>;
  const dirty = JSON.stringify(form) !== saved;

  // After a walkthrough saves: show what was saved.
  const takeSaved = (next: ProfileForm, message: string) => {
    setForm(next);
    setSaved(JSON.stringify(next));
    setStatus(message);
    setMode("edit");
  };

  if (mode === "profile-wizard") {
    return (
      <div className="page">
        <ProfileWizard
          initial={form}
          onCancel={() => setMode("edit")}
          onSaved={(next) => takeSaved(next, "Profile saved from the walkthrough.")}
        />
      </div>
    );
  }
  if (mode === "rules-wizard") {
    return (
      <div className="page">
        <RulesWizard
          roles={form.roles.map((r) => r.name).filter(Boolean)}
          onCancel={() => setMode("edit")}
          onSaved={(rules) => takeSaved({ ...form, rules }, "CV rules saved from the walkthrough.")}
        />
      </div>
    );
  }

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
      takeSaved({ profile, roles, rules }, "Saved.");
    });

  const importFile = (file: File) =>
    run("Reading your CV with AI (up to a minute)...", async () => {
      setForm({ ...form, profile: await importCv(file) });
      setStatus(`Imported from ${file.name}. Review every section, then press Save.`);
    });

  // A walkthrough starts from the form as it is now, unsaved edits included.
  const start = (wizard: "profile-wizard" | "rules-wizard") => {
    if (dirty && !confirm("You have unsaved changes below. Start the walkthrough from them anyway?")) return;
    setMode(wizard);
  };

  const setProfile = (key: string, value: unknown) => setForm({ ...form, profile: { ...form.profile, [key]: value } });

  return (
    <div className="page">
      <div className="walkthroughs">
        <div className="card">
          <b>Profile walkthrough</b>
          <p className="hint">
            Go through your profile step by step: details, experience, projects, education, skills, preferences and
            target roles. It works on a copy; nothing changes until you save at the end.
          </p>
          <button className="primary" onClick={() => start("profile-wizard")}>
            Start
          </button>
        </div>
        <div className="card">
          <b>CV rules walkthrough</b>
          <p className="hint">
            Set the rules the AI follows for every CV: length, language, tricky skills, what to leave out per kind of
            job. You can start from rules you already have.
          </p>
          <button className="primary" onClick={() => start("rules-wizard")}>
            Start
          </button>
        </div>
      </div>

      <div className="toolbar">
        <button className="primary" onClick={save} disabled={!!busy || !dirty}>
          Save
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
            (dirty ? [status !== "Saved." && status, "Unsaved changes"].filter(Boolean).join(" · ") : status)}
        </span>
      </div>
      {error && <p className="error">{error}</p>}

      <h2>Personal</h2>
      <ObjectEditor fields={PERSONAL_FIELDS} value={form.profile.personal} onChange={(v) => setProfile("personal", v)} />

      {LIST_SECTIONS.map((section) => (
        <section key={section.key}>
          <h2>{section.title}</h2>
          <ListEditor
            fields={section.fields}
            items={(form.profile as any)[section.key]}
            onChange={(items) => setProfile(section.key, items)}
            itemLabel={section.label}
          />
        </section>
      ))}

      <h2>Other</h2>
      <ObjectEditor
        fields={[{ key: "other", label: "Anything else worth knowing (one per line)", kind: "lines" }]}
        value={{ other: form.profile.other }}
        onChange={(v) => setProfile("other", v.other)}
      />

      <h2>Job preferences</h2>
      <ObjectEditor fields={PREFERENCE_FIELDS} value={form.profile.preferences} onChange={(v) => setProfile("preferences", v)} />

      <h2>Target roles</h2>
      <p className="hint">
        The kinds of jobs you apply for. Ready-made CVs for a role go in the CVs tab, with the role's name as their
        category.
      </p>
      <ListEditor
        fields={ROLE_FIELDS}
        items={form.roles}
        onChange={(roles) => setForm({ ...form, roles: roles as ProfileForm["roles"] })}
        itemLabel={(r) => r.name}
      />

      <h2>Rules for your CVs</h2>
      <p className="hint">The text the AI follows for every CV. The CV rules walkthrough writes it for you; you can also edit it here.</p>
      <textarea className="rules" rows={12} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
    </div>
  );
}
