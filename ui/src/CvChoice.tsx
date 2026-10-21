import { useContext } from "react";
import { cvChoice, type CvEntry } from "./cvsApi";
import { RolesContext } from "./roles";

// A dropdown of a job's CV options: the library's CVs grouped by category, or a
// CV tailored from the profile for one of the target roles. `value` is the job's cv_choice.
export function CvChoice({
  cvs,
  value,
  onChange,
}: {
  cvs: CvEntry[];
  value: string;
  onChange: (value: string) => void;
}) {
  const roles = useContext(RolesContext);
  const categories = [...new Set(cvs.map((cv) => cv.category))].sort();
  const tailored = ["tailored:", ...roles.map((role) => `tailored: ${role}`)];
  const known = value === "" || cvs.some((cv) => cvChoice(cv.file) === value) || tailored.includes(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {!known && <option value={value}>{value} (missing)</option>}
      <optgroup label="Tailored from your profile">
        {tailored.map((choice) => (
          <option key={choice} value={choice}>
            {choice === "tailored:" ? "Tailored (no role)" : `Tailored: ${choice.slice("tailored: ".length)}`}
          </option>
        ))}
      </optgroup>
      {categories.map((category) => (
        <optgroup key={category} label={category || "Ready-made, no category"}>
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
