import { describe, expect, it } from "vitest";
import { cleanConfig } from "./config.js";
import { filterReason } from "./filters.js";
import type { Requirements } from "./requirements.js";

const requirements: Requirements = {
  work_model: "onsite",
  employment_type: "full-time",
  seniority: "junior",
  min_years_experience: 2,
  field: "software QA",
  must_have: [],
  nice_to_have: [],
  language_requirements: [],
  asks_for_attachments: [],
};
const job = { location: "Petah Tikva, Israel", employment_type: "Full-time", description: "Day shifts. Python." };
const filters = (f: object) => cleanConfig({ filters: f }).filters;

describe("filterReason", () => {
  it("passes a job when no filters are set", () => {
    expect(filterReason(filters({}), job, requirements)).toBe("");
  });

  it("rejects by employment type, also as the site writes it", () => {
    expect(filterReason(filters({ reject_employment_types: ["internship"] }), job, { ...requirements, employment_type: "internship" })).toBe("rejected: internship");
    expect(filterReason(filters({ reject_employment_types: ["part-time"] }), { ...job, employment_type: "part_time" }, requirements)).toBe("rejected: part-time");
  });

  it("rejects jobs asking for too many years", () => {
    expect(filterReason(filters({ max_min_years_experience: 1 }), job, requirements)).toBe("rejected: asks for 2+ years");
    expect(filterReason(filters({ max_min_years_experience: 3 }), job, requirements)).toBe("");
  });

  it("rejects by keyword and location, but remote jobs pass the location filter", () => {
    expect(filterReason(filters({ reject_keywords: ["python"] }), job, requirements)).toBe('rejected: mentions "python"');
    expect(filterReason(filters({ locations: ["Tel Aviv"] }), job, requirements)).toBe("rejected: location Petah Tikva, Israel");
    expect(filterReason(filters({ locations: ["Tel Aviv"] }), job, { ...requirements, work_model: "remote" })).toBe("");
    expect(filterReason(filters({ locations: ["petah tikva"] }), job, requirements)).toBe("");
  });

  it("rejects other fields when accepted fields are listed", () => {
    expect(filterReason(filters({ accept_fields: ["QA"] }), job, requirements)).toBe("");
    expect(filterReason(filters({ accept_fields: ["accounting"] }), job, requirements)).toBe("rejected: field software QA");
  });
});
