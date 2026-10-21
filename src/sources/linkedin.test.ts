import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { relativeToDate } from "../dates.js";
import { parseLinkedinJob } from "./linkedin.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOW = new Date(2026, 9, 21, 12, 0); // 2026-10-21, local time

describe("parseLinkedinJob", () => {
  it("reads an open job", () => {
    const job = parseLinkedinJob(fixture("linkedin-open.html"), NOW);
    expect(job.title).toBe("QA Engineer");
    expect(job.company).toBe("bolt");
    expect(job.closed).toBe(false);
    expect(job.posted_date).toBe("2026-10-21"); // "10 hours ago"
    expect(job.description).toMatch(/^About us/);
    expect(job.description).toContain("\n- "); // list items kept as lines
  });

  it("reads a closed job with its criteria", () => {
    const job = parseLinkedinJob(fixture("linkedin-4475368276.html"), NOW);
    expect(job).toMatchObject({
      title: "DevOps Engineer",
      company: "MalamTeam",
      location: "Petah Tikva, Center District, Israel",
      closed: true,
      employment_type: "Full-time",
      seniority: "Entry level",
      employer_link: "",
    });
    expect(job.description).toContain("Devops");
  });
});

describe("relativeToDate", () => {
  it("turns LinkedIn's relative times into dates", () => {
    expect(relativeToDate("2 days ago", NOW)).toBe("2026-10-19");
    expect(relativeToDate("1 week ago", NOW)).toBe("2026-10-14");
    expect(relativeToDate("3 months ago", NOW)).toBe("2026-07-21");
    expect(relativeToDate("Reposted 5 hours ago", NOW)).toBe("2026-10-21");
    expect(relativeToDate("", NOW)).toBe("");
  });
});
