import type { Field } from "./fields";

// How each part of the profile is edited: shared by the Profile editor and the
// profile walkthrough.

export const ENTRY_FIELDS: Field[] = [
  { key: "role", label: "Role / job title" },
  { key: "organization", label: "Organization" },
  { key: "start", label: "Start (e.g. 2022-03)" },
  { key: "end", label: "End (or 'present')" },
  { key: "location", label: "Location" },
  { key: "facts", label: "What you did and achieved (one per line)", kind: "lines" },
  { key: "skills", label: "Skills and tools used (comma separated)", kind: "list" },
];

// The list sections of the profile, in page order.
export const LIST_SECTIONS: { key: string; title: string; fields: Field[]; label: (item: any) => string }[] = [
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

export const PERSONAL_FIELDS: Field[] = [
  { key: "name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "links", label: "Links: LinkedIn, portfolio, GitHub... (one per line)", kind: "lines" },
  { key: "summary", label: "Summary", kind: "long" },
];

export const PREFERENCE_FIELDS: Field[] = [
  { key: "seniority", label: "Seniority (comma separated, e.g. junior, mid)", kind: "list" },
  { key: "locations", label: "Locations (comma separated)", kind: "list" },
  { key: "work_model", label: "Work model (comma separated: onsite, hybrid, remote)", kind: "list" },
  { key: "job_types", label: "Job types (comma separated, e.g. full-time)", kind: "list" },
  { key: "notes", label: "Anything else", kind: "long" },
];

export const ROLE_FIELDS: Field[] = [
  { key: "name", label: "Role name (e.g. QA automation)" },
  { key: "fits", label: "Which jobs it fits" },
  { key: "emphasis", label: "What to lead with when tailoring a CV for it", kind: "long" },
];
