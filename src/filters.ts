import type { Filters } from "./config.js";
import type { Requirements } from "./requirements.js";

// Rule-based filters (plan section 6): the reason a job is rejected, or "" if it passes.
// Uses the AI-extracted requirements plus what the site said.
export function filterReason(
  filters: Filters,
  job: { location: string; employment_type: string; description: string },
  requirements: Requirements,
): string {
  const lower = (s: string) => s.toLowerCase().replace(/_/g, "-");

  const types = [lower(requirements.employment_type), lower(job.employment_type)];
  for (const reject of filters.reject_employment_types) {
    if (types.some((type) => type.includes(lower(reject)))) return `rejected: ${reject}`;
  }

  const years = requirements.min_years_experience;
  if (filters.max_min_years_experience !== null && years !== null && years > filters.max_min_years_experience) {
    return `rejected: asks for ${years}+ years`;
  }

  const text = lower(job.description);
  for (const keyword of filters.reject_keywords) {
    if (text.includes(lower(keyword))) return `rejected: mentions "${keyword}"`;
  }

  // Remote jobs and jobs without a location always pass the location filter.
  if (filters.locations.length && requirements.work_model !== "remote" && job.location.trim()) {
    const place = lower(job.location);
    if (!filters.locations.some((wanted) => place.includes(lower(wanted)))) {
      return `rejected: location ${job.location}`;
    }
  }

  if (filters.accept_fields.length && requirements.field) {
    const field = lower(requirements.field);
    const matches = filters.accept_fields.some((wanted) => field.includes(lower(wanted)) || lower(wanted).includes(field));
    if (!matches) return `rejected: field ${requirements.field}`;
  }

  return "";
}
