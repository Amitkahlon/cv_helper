import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseHiremeJob } from "./hireme.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("parseHiremeJob", () => {
  it("reads an open job (logged-out answer)", () => {
    const { job, loggedOut } = parseHiremeJob(fixture("hireme-open.json"));
    expect(job.title).toBe("Junior AI Engineer");
    expect(job.closed).toBe(false);
    expect(job.posted_date).toBe("2026-10-06");
    expect(job.description).toContain("Edventure");
    expect(job.company).toBe(""); // masked when logged out
    expect(job.employer_link).toBe("");
    expect(loggedOut).toBe(true);
  });

  it("marks a closed job", () => {
    expect(parseHiremeJob(fixture("hireme-closed.json")).job.closed).toBe(true);
  });

  it("only accepts real external apply links", () => {
    const link = (job: object) => parseHiremeJob({ job }).job.employer_link;
    expect(link({ apply_url: "https://jobs.example.com/1" })).toBe("https://jobs.example.com/1");
    expect(link({ apply_url: "internal-slug", job_url: "https://hiremetech.com/job/1" })).toBe("");
    expect(link({ application_email: "jobs@example.com" })).toBe("mailto:jobs@example.com");
  });
});
