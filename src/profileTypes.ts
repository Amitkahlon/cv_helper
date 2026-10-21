// The user's profile (profile/profile.yaml, plan section 6). Plain types with no
// imports, so the UI can share them. Unknown values are "" or [].

// A job, military / national service, or volunteering.
export interface Entry {
  role: string;
  organization: string;
  start: string; // as the user writes it, e.g. "2022-03"
  end: string; // or "present"
  location: string;
  facts: string[]; // what was actually done and achieved, one per item
  skills: string[];
}

export interface Project {
  name: string;
  link: string;
  description: string;
  skills: string[];
}

export interface Education {
  degree: string;
  institution: string;
  start: string;
  end: string;
  grade: string;
  notable_courses: string[];
}

export interface Profile {
  personal: {
    name: string;
    email: string;
    phone: string;
    city: string;
    links: string[]; // LinkedIn, portfolio, GitHub, ...
    summary: string;
  };
  experience: Entry[];
  projects: Project[];
  education: Education[];
  skills: { group: string; items: string[] }[];
  certifications: { name: string; issuer: string; date: string }[];
  languages: { language: string; level: string }[];
  military_or_service: Entry[];
  volunteering: Entry[];
  other: string[];
  preferences: {
    seniority: string[];
    locations: string[];
    work_model: string[];
    job_types: string[];
    notes: string;
  };
}

// A target role (profile/roles.yaml): one kind of job the user applies for.
// Ready-made CVs for a role are in the CV library, under the role's name as category.
export interface Role {
  name: string;
  fits: string; // which jobs it fits, in a line
  emphasis: string; // what to lead with when tailoring a CV for it
}

// A ready-made CV in the library (profile/cvs/ + profile/cvs.yaml).
export interface CvEntry {
  file: string; // file name inside profile/cvs/, e.g. "qa_automation.pdf"
  name: string; // shown in the UI
  category: string; // free text, e.g. a target role's name
  purpose: string; // which jobs it is for
}

export interface ProfileData {
  profile: Profile;
  roles: Role[];
  rules: string; // profile/rules.md
  exists: boolean; // false until profile.yaml has been saved once
}

// The profile sections the AI can ask questions about.
export const SECTION_KEYS = [
  "personal", "experience", "projects", "education", "skills", "certifications", "languages",
  "military_or_service", "volunteering", "other", "preferences", "roles",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface ProfileQuestion {
  section: SectionKey;
  entry: number | null; // index in the section's list, or null for the section as a whole
  question: string;
}
