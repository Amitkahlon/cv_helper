import { cvChoice, type CvEntry } from "./cvsApi";

// A dropdown of the library's CVs, grouped by category. `value` is the job's cv_choice.
export function CvChoice({
  cvs,
  value,
  onChange,
}: {
  cvs: CvEntry[];
  value: string;
  onChange: (value: string) => void;
}) {
  const categories = [...new Set(cvs.map((cv) => cv.category))].sort();
  const known = value === "" || cvs.some((cv) => cvChoice(cv.file) === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {!known && <option value={value}>{value} (missing)</option>}
      {categories.map((category) => (
        <optgroup key={category} label={category || "No category"}>
          {cvs
            .filter((cv) => cv.category === category)
            .map((cv) => (
              <option key={cv.file} value={cvChoice(cv.file)}>
                {cv.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
