import { describe, expect, it } from "vitest";
import { jobIdFor, knownKeys, linkInfo } from "./jobKey.js";

describe("linkInfo", () => {
  it("reduces every LinkedIn link shape to the job id", () => {
    const links = [
      "https://www.linkedin.com/jobs/view/4475368276",
      "https://www.linkedin.com/jobs/view/4475368276/?refId=abc&trk=public_jobs",
      "https://il.linkedin.com/jobs/view/devops-engineer-at-malamteam-4475368276",
      "https://www.linkedin.com/jobs/search/?currentJobId=4475368276&keywords=devops",
      "http://linkedin.com/comm/jobs/view/4475368276",
    ];
    for (const link of links) {
      expect(linkInfo(link)).toEqual({
        key: "linkedin:4475368276",
        site: "linkedin",
        siteJobId: "4475368276",
      });
    }
  });

  it("reduces every HireMe link shape to the job id", () => {
    const links = [
      "https://hiremetech.com/job/149714539?utm_source=share84297",
      "https://juniors.hiremetech.com/job/149714539?utm_source=wa_b64aa55d&utm_content=wa_clean",
      "https://hiremetech.com/he-il/job/149714539",
    ];
    for (const link of links) {
      expect(linkInfo(link)).toEqual({
        key: "hireme:149714539",
        site: "hireme",
        siteJobId: "149714539",
      });
    }
  });

  it("cleans other links but keeps meaningful parameters", () => {
    const a = linkInfo("https://www.Example.com/careers/123/?utm_source=wa&id=5#apply");
    const b = linkInfo("https://example.com/careers/123?id=5");
    const c = linkInfo("https://example.com/careers/123?id=6");
    expect(a.key).toBe("example.com/careers/123?id=5");
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
    expect(a.site).toBe("other");
  });
});

describe("jobIdFor", () => {
  it("uses the site job id when there is one", () => {
    expect(jobIdFor(linkInfo("https://www.linkedin.com/jobs/view/4475368276"))).toBe(
      "linkedin-4475368276",
    );
  });

  it("gives other links a stable short code", () => {
    const id = jobIdFor(linkInfo("https://example.com/careers/123"));
    expect(id).toMatch(/^job-[0-9a-f]{10}$/);
    expect(jobIdFor(linkInfo("https://example.com/careers/123/?utm_source=x"))).toBe(id);
  });
});

describe("knownKeys", () => {
  it("collects keys from both job_link and agency_link", () => {
    const keys = knownKeys([
      { job_link: "https://www.linkedin.com/jobs/view/1", agency_link: "" },
      { job_link: "", agency_link: "https://example-agency.com/jobs/77?utm_source=x" },
    ]);
    expect(keys).toEqual(new Set(["linkedin:1", "example-agency.com/jobs/77"]));
  });
});
