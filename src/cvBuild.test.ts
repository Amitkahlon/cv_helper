import { describe, expect, it } from "vitest";
import { completeChecklist, parseChoice, scoreOf, validateContent } from "./cvBuild.js";
import { cleanConfig } from "./config.js";
import { renderCvHtml } from "./cvTemplate.js";
import { cleanProfile } from "./profile.js";
import type { Requirements } from "./requirements.js";

const profile = cleanProfile({
  personal: { name: "Amit Kahlon", email: "a@b.c", links: ["github.com/amit"] },
  experience: [
    { role: "QA Automation Developer", organization: "Unleash", start: "2022-02", end: "2023-05", facts: ["Built a Cypress framework"], skills: ["Cypress", "TypeScript"] },
  ],
  projects: [{ name: "Test Tracker", description: "npm package", skills: ["Node.js"] }],
  education: [{ degree: "B.Sc. Computer Science", institution: "Open University", grade: "83" }],
  skills: [{ group: "Tools", items: ["Docker"] }],
  languages: [{ language: "Hebrew", level: "native" }],
});

const requirements: Requirements = {
  work_model: "onsite", employment_type: "full-time", seniority: "junior", min_years_experience: 2, field: "QA",
  must_have: [{ id: "R1", text: "Cypress" }, { id: "R2", text: "Kubernetes" }],
  nice_to_have: [{ id: "N1", text: "Docker" }],
  language_requirements: [], asks_for_attachments: [],
};

describe("validateContent", () => {
  it("drops unknown entries and skills the profile doesn't have", () => {
    const { content, warnings } = validateContent(profile, {
      summary: " QA engineer ",
      experience: [{ index: 0, bullets: ["Built a Cypress framework", " "] }, { index: 7, bullets: ["made up"] }, { index: 0, bullets: [] }],
      military_or_service: [],
      volunteering: [],
      projects: [{ index: 0, description: "npm package" }],
      education: [{ index: 0, notable_courses: [] }],
      skills: [{ group: "Testing", items: ["Cypress", "Kubernetes"] }, { group: "Empty", items: ["Rust"] }],
      certifications: [3],
    });
    expect(content.summary).toBe("QA engineer");
    expect(content.experience).toEqual([{ index: 0, bullets: ["Built a Cypress framework"] }]);
    expect(content.skills).toEqual([{ group: "Testing", items: ["Cypress"] }]);
    expect(content.certifications).toEqual([]);
    expect(content.section_order?.slice(0, 2)).toEqual(["experience", "projects"]);
    expect(warnings).toEqual([
      'Removed "Kubernetes" from the skills: it isn\'t in your profile.',
      'Removed "Rust" from the skills: it isn\'t in your profile.',
    ]);
  });
});

describe("checklist and score", () => {
  it("lists every requirement and scores met must-haves", () => {
    const checklist = completeChecklist(requirements, [
      { id: "R1", status: "met", evidence: "Cypress framework at Unleash" },
      { id: "N1", status: "partly", evidence: "Docker listed" },
    ]);
    expect(checklist.map((c) => [c.id, c.status])).toEqual([["R1", "met"], ["R2", "not_met"], ["N1", "partly"]]);
    expect(checklist[1].evidence).toBe("not assessed");
    expect(scoreOf(checklist)).toBe("1/2");
  });
});

describe("parseChoice", () => {
  it("reads both kinds of CV choice", () => {
    expect(parseChoice("predefined: qa.pdf")).toEqual({ kind: "predefined", file: "qa.pdf" });
    expect(parseChoice("tailored: QA automation")).toEqual({ kind: "tailored", role: "QA automation" });
    expect(parseChoice("tailored:")).toEqual({ kind: "tailored", role: "" });
    expect(parseChoice("")).toBeNull();
  });
});

describe("renderCvHtml", () => {
  it("takes names, titles and dates from the profile and escapes text", () => {
    const html = renderCvHtml(
      profile,
      {
        summary: "Tests <everything>",
        experience: [{ index: 0, bullets: ["Built a Cypress framework"] }],
        military_or_service: [], volunteering: [],
        projects: [{ index: 0, description: "npm package" }],
        education: [{ index: 0, notable_courses: [] }],
        skills: [{ group: "Tools", items: ["Docker"] }],
        certifications: [],
      },
      cleanConfig({}).cv,
    );
    expect(html).toContain("Amit Kahlon");
    expect(html).toContain("QA Automation Developer — Unleash");
    expect(html).toContain("2022-02 – 2023-05");
    expect(html).toContain("Tests &lt;everything&gt;");
    expect(html).toContain("Hebrew (native)");
    expect(html).not.toContain("Military");
  });
});

describe("checklistMarkdown", () => {
  it("keeps blank lines between sections", async () => {
    const { checklistMarkdown } = await import("./cvBuild.js");
    const md = checklistMarkdown(
      { title: "QA", company: "bolt" } as any,
      { choice: "tailored:", file: "jobs/x/CV.pdf", built_at: "", note: "Leads with QA.", adapted: [], score: "1/1", warnings: [],
        checklist: [{ id: "R1", requirement: "Cypress", status: "met", evidence: "Unleash" }] },
    );
    expect(md).toContain("Leads with QA.\n\n## Must have\n- ✅ Cypress — Unleash\n\n## Nice to have\n- (none)");
  });
});

describe("section order", () => {
  it("follows the chosen order and adds missing sections at the end", async () => {
    const { orderSections } = await import("./cvTemplate.js");
    expect(orderSections(["education", "bogus", "education", "projects"]).slice(0, 3)).toEqual(["education", "projects", "experience"]);
    expect(orderSections(undefined)).toHaveLength(8);
    const html = renderCvHtml(
      profile,
      { summary: "", experience: [{ index: 0, bullets: [] }], military_or_service: [], volunteering: [], projects: [],
        education: [{ index: 0, notable_courses: [] }], skills: [], certifications: [], section_order: ["education", "experience"] },
      cleanConfig({}).cv,
    );
    expect(html.indexOf(">Education<")).toBeLessThan(html.indexOf(">Experience<"));
  });
});
