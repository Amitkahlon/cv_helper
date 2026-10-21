import { useEffect, useState } from "react";
import { deleteCv, saveCvs, uploadCv, cvUrl, type CvEntry } from "./cvsApi";
import { fetchProfile } from "./profileApi";

// The CV library: upload ready-made CVs and say what each is for. Edits are
// saved when you leave a field.
export function CvsPage({ cvs, onChange }: { cvs: CvEntry[]; onChange: (cvs: CvEntry[]) => void }) {
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProfile().then((data) => setRoleNames(data.roles.map((r) => r.name).filter(Boolean)), () => {});
  }, []);

  // Suggestions for the category field: target roles, plus categories already used.
  const categories = [...new Set([...roleNames, ...cvs.map((cv) => cv.category).filter(Boolean)])].sort();

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

  const upload = (files: File[]) =>
    run("Uploading...", async () => {
      const added: CvEntry[] = [];
      for (const file of files) added.push(await uploadCv(file));
      onChange([...cvs, ...added]);
      setStatus(`Added ${added.length} CV(s). Give each a category and say what it's for.`);
    });

  const save = (next: CvEntry[]) =>
    run("Saving...", async () => {
      onChange(await saveCvs(next));
      setStatus("Saved.");
    });

  const remove = (cv: CvEntry) => {
    if (!confirm(`Delete "${cv.name}"? Jobs that chose it will have no CV chosen.`)) return;
    run("Deleting...", async () => {
      await deleteCv(cv.file);
      onChange(cvs.filter((c) => c.file !== cv.file));
      setStatus("Deleted.");
    });
  };

  const edit = (file: string, field: keyof CvEntry, value: string) =>
    onChange(cvs.map((cv) => (cv.file === file ? { ...cv, [field]: value } : cv)));

  return (
    <div className="page">
      <div className="toolbar">
        <label className="upload">
          Upload CVs (PDF or DOCX, several at once):{" "}
          <input
            type="file"
            accept=".pdf,.docx"
            multiple
            disabled={!!busy}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) upload(files);
            }}
          />
        </label>
        <span>{busy || status}</span>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Use a target role's name as the category to link a CV to that role. Pick a CV for a job in the Jobs
        table or in the job's details.
      </p>
      {cvs.length === 0 && <p>No CVs yet.</p>}
      <datalist id="cv-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {cvs.map((cv) => (
        <fieldset key={cv.file} className="entry">
          <legend dir="auto">
            {cv.name}{" "}
            <a href={cvUrl(cv.file)} target="_blank" rel="noreferrer">
              open
            </a>
          </legend>
          <div className="fields">
            <label className="field">
              <span>Name</span>
              <input dir="auto" value={cv.name} onChange={(e) => edit(cv.file, "name", e.target.value)} onBlur={() => save(cvs)} />
            </label>
            <label className="field">
              <span>Category</span>
              <input
                dir="auto"
                list="cv-categories"
                value={cv.category}
                onChange={(e) => edit(cv.file, "category", e.target.value)}
                onBlur={() => save(cvs)}
              />
            </label>
            <label className="field wide">
              <span>What it's for (which jobs)</span>
              <input
                dir="auto"
                value={cv.purpose}
                onChange={(e) => edit(cv.file, "purpose", e.target.value)}
                onBlur={() => save(cvs)}
              />
            </label>
          </div>
          <p className="hint">File: {cv.file}</p>
          <button onClick={() => remove(cv)} disabled={!!busy}>
            Delete
          </button>
        </fieldset>
      ))}
    </div>
  );
}
