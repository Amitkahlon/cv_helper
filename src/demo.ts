import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobRecord } from "./add.js";
import { loadConfig, saveConfig } from "./config.js";
import { checklistMarkdown, completeChecklist, renderPdf, scoreOf, type CvReport } from "./cvBuild.js";
import { cvFileName } from "./cvLibrary.js";
import { renderCvHtml, type TailoredContent } from "./cvTemplate.js";
import { addJobs, type JobRow } from "./jobsCsv.js";
import { saveProfile } from "./profile.js";
import type { Requirements } from "./requirements.js";
import { createWorkspace, jobsCsvPath } from "./workspace.js";

// A workspace full of made-up data (a fictional person and fictional
// companies), for trying cvhelper or showing it without anyone's real data.

const PROFILE = {
  personal: {
    name: "Noa Example",
    email: "noa@example.com",
    phone: "050-000-0000",
    city: "Tel Aviv",
    links: ["github.com/noa-example"],
    summary: "QA automation engineer who builds test frameworks and CI pipelines.",
  },
  experience: [
    {
      role: "QA Automation Engineer",
      organization: "Sample Software Ltd.",
      start: "2023-01",
      end: "present",
      location: "Tel Aviv",
      facts: [
        "Built a Playwright end-to-end framework in TypeScript covering 400 tests",
        "Cut the regression run from 3 hours to 25 minutes by running tests in parallel in CI",
        "Wrote API tests for 60 REST endpoints with Postman and Jest",
      ],
      skills: ["Playwright", "TypeScript", "Jest", "Postman", "GitHub Actions", "SQL"],
    },
    {
      role: "Manual QA Tester",
      organization: "Demo Apps Inc.",
      start: "2021-06",
      end: "2022-12",
      location: "Haifa",
      facts: ["Tested a mobile banking app on iOS and Android", "Wrote 300 test cases in TestRail"],
      skills: ["TestRail", "Jira", "Android", "iOS"],
    },
  ],
  projects: [
    { name: "Flaky Test Finder", link: "github.com/noa-example/flaky", description: "Finds flaky tests from CI history", skills: ["Python", "SQL"] },
  ],
  education: [{ degree: "B.Sc. Computer Science", institution: "Example University", start: "2017", end: "2021", grade: "88" }],
  skills: [
    { group: "Testing", items: ["Playwright", "Jest", "Postman", "TestRail"] },
    { group: "Languages", items: ["TypeScript", "Python", "SQL"] },
    { group: "Tools", items: ["GitHub Actions", "Docker", "Jira"] },
  ],
  languages: [
    { language: "Hebrew", level: "native" },
    { language: "English", level: "fluent" },
  ],
};

const ROLES = [
  { name: "QA automation", fits: "QA automation, SDET and test infrastructure jobs", emphasis: "Lead with the Playwright framework and the CI speed-up." },
  { name: "Manual QA", fits: "Manual QA and testing jobs", emphasis: "Lead with test design and mobile testing." },
];

interface DemoJob {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  description: string;
  must: string[];
  nice: string[];
  row: JobRow;
}

const JOBS: DemoJob[] = [
  {
    id: "job-demo000001", title: "QA Automation Engineer", company: "Acme Robotics (fictional)", location: "Tel Aviv",
    posted: "2026-10-18",
    description: "Acme Robotics is looking for a QA Automation Engineer to own our end-to-end tests.\n\nRequirements:\n- 2+ years in test automation\n- Playwright or Cypress\n- TypeScript\n- CI/CD experience\n\nAdvantage: Docker, SQL",
    must: ["2+ years in test automation", "Playwright or Cypress", "TypeScript", "CI/CD experience"],
    nice: ["Docker", "SQL"],
    row: { cv_choice: "tailored: QA automation" },
  },
  {
    id: "job-demo000002", title: "SDET", company: "Blue Harbor Analytics (fictional)", location: "Herzliya · Hybrid",
    posted: "2026-10-16",
    description: "Join our platform team as an SDET.\n\nRequirements:\n- Strong coding in Python or TypeScript\n- API testing\n- 3+ years experience\n\nNice to have: Kubernetes",
    must: ["Strong coding in Python or TypeScript", "API testing", "3+ years experience"],
    nice: ["Kubernetes"],
    row: { cv_choice: "tailored: QA automation" },
  },
  {
    id: "job-demo000003", title: "Manual QA Tester", company: "Green Leaf Apps (fictional)", location: "Haifa",
    posted: "2026-10-12",
    description: "Test our mobile apps before every release.\n\nRequirements:\n- Mobile testing experience\n- Writing test cases\n\nAdvantage: TestRail",
    must: ["Mobile testing experience", "Writing test cases"],
    nice: ["TestRail"],
    row: {},
  },
  {
    id: "job-demo000004", title: "Test Automation Developer", company: "Northwind Systems (fictional)", location: "Petah Tikva",
    posted: "2026-09-20",
    description: "Automate tests for our payments platform.\n\nRequirements:\n- Test automation\n- SQL",
    must: ["Test automation", "SQL"], nice: [],
    row: { submitted: "YES", submitted_date: "2026-09-22", phone_call_date: "2026-09-29", interview_date: "2026-10-06" },
  },
  {
    id: "job-demo000005", title: "QA Engineer", company: "Orbit Health (fictional)", location: "Remote",
    posted: "2026-09-15",
    description: "QA for a health records product.\n\nRequirements:\n- QA experience\n- API testing",
    must: ["QA experience", "API testing"], nice: [],
    row: { submitted: "YES", submitted_date: "2026-09-17", rejected_date: "2026-10-01" },
  },
  {
    id: "job-demo000006", title: "Automation Engineer", company: "Cedar Labs (fictional)", location: "Jerusalem",
    posted: "2026-08-30",
    description: "Build automation for lab devices.\n\nRequirements:\n- Python\n- Automation frameworks",
    must: ["Python", "Automation frameworks"], nice: [],
    row: { submitted: "YES", submitted_date: "2026-09-02", phone_call_date: "2026-09-08", interview_date: "2026-09-15", offer_date: "2026-09-28" },
  },
  {
    id: "job-demo000007", title: "QA Intern", company: "Student Corp (fictional)", location: "Tel Aviv",
    posted: "2026-10-10",
    description: "Internship for students.\n\nRequirements:\n- Currently a student",
    must: ["Currently a student"], nice: [],
    row: { filter: "rejected: internship" },
  },
];

// The tailored CV built for the first job, written by hand (no AI needed).
const DEMO_CV: TailoredContent = {
  summary: "QA automation engineer with 3 years of experience building Playwright frameworks in TypeScript and fast CI pipelines.",
  experience: [
    { index: 0, bullets: ["Built a Playwright end-to-end framework in TypeScript covering 400 tests", "Cut the regression run from 3 hours to 25 minutes by running tests in parallel in CI", "Wrote API tests for 60 REST endpoints with Postman and Jest"] },
    { index: 1, bullets: ["Tested a mobile banking app on iOS and Android", "Wrote 300 test cases in TestRail"] },
  ],
  military_or_service: [],
  volunteering: [],
  projects: [{ index: 0, description: "Finds flaky tests from CI history" }],
  education: [{ index: 0, notable_courses: [] }],
  skills: [
    { group: "Testing", items: ["Playwright", "Jest", "Postman"] },
    { group: "Languages", items: ["TypeScript", "Python", "SQL"] },
    { group: "Tools", items: ["GitHub Actions", "Docker"] },
  ],
  certifications: [],
};

export async function createDemoWorkspace(folder: string): Promise<void> {
  await createWorkspace(folder);
  const config = await loadConfig(folder);
  const { profile } = await saveProfile(folder, { profile: PROFILE, roles: ROLES, rules: "# Rules for your CVs\n\n- Never claim what isn't in the profile.\n- One page.\n" });
  await saveConfig(folder, { ...(await loadConfig(folder)), filters: { reject_employment_types: ["internship"] } });

  const rows: JobRow[] = [];
  for (const demo of JOBS) {
    const requirements: Requirements = {
      work_model: demo.location.includes("Remote") ? "remote" : demo.location.includes("Hybrid") ? "hybrid" : "onsite",
      employment_type: demo.title.includes("Intern") ? "internship" : "full-time",
      seniority: "junior",
      min_years_experience: null,
      field: "software QA",
      must_have: demo.must.map((text, i) => ({ id: `R${i + 1}`, text })),
      nice_to_have: demo.nice.map((text, i) => ({ id: `N${i + 1}`, text })),
      language_requirements: [],
      asks_for_attachments: [],
    };
    const record: JobRecord = {
      id: demo.id, source: "other", source_job_id: "", job_link: `https://example.com/jobs/${demo.id}`, agency_link: null,
      first_seen: demo.posted, title: demo.title, company: demo.company, location: demo.location, posted_date: demo.posted,
      closed: false, employment_type: requirements.employment_type, seniority: "", description: demo.description, requirements,
    };
    const dir = path.join(folder, "jobs", demo.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "job.json"), JSON.stringify(record, null, 2) + "\n", "utf8");
    rows.push({
      title: demo.title, company: demo.company, location: demo.location, job_link: record.job_link, posted_date: demo.posted,
      first_seen: demo.posted, id: demo.id, requirements: demo.must.join("; "), ...demo.row,
    });

    if (demo.id === "job-demo000001") {
      const { pdf } = await renderPdf((scale) => renderCvHtml(profile, DEMO_CV, config.cv, scale));
      const file = path.join(dir, cvFileName(profile.personal.name, ".pdf"));
      await writeFile(file, pdf);
      const checklist = completeChecklist(requirements, [
        { id: "R1", status: "met", evidence: "3 years of QA automation at Sample Software" },
        { id: "R2", status: "met", evidence: "Built a Playwright framework" },
        { id: "R3", status: "met", evidence: "Framework written in TypeScript" },
        { id: "R4", status: "met", evidence: "Parallel test runs in GitHub Actions" },
        { id: "N1", status: "partly", evidence: "Docker is listed under tools, without details" },
        { id: "N2", status: "met", evidence: "SQL in Flaky Test Finder" },
      ]);
      const report: CvReport = {
        choice: "tailored: QA automation", file: path.relative(folder, file).split(path.sep).join("/"), built_at: new Date().toISOString(),
        note: "Leads with the Playwright framework and the CI speed-up.", adapted: ["Put the Playwright framework first", "Moved the Testing skills group to the top"],
        checklist, score: scoreOf(checklist), warnings: [], content: DEMO_CV,
      };
      await writeFile(path.join(dir, "cv.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
      await writeFile(path.join(dir, "checklist.md"), checklistMarkdown(record, report), "utf8");
      Object.assign(rows[rows.length - 1], { cv_status: "built", cv_file: report.file, score: report.score });
    }
  }
  await addJobs(jobsCsvPath(folder), rows);
}
