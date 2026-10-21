import { describe, expect, it } from "vitest";
import { repostOf, similarity } from "./repost.js";

const text =
  "We are looking for a QA automation engineer to join our platform team. You will build and maintain " +
  "end-to-end tests with Playwright, review pull requests, improve our CI pipelines and work closely with " +
  "developers and product managers. Requirements: two years of test automation, TypeScript, SQL.";

describe("repostOf", () => {
  it("finds the same job reposted with small edits", () => {
    const earlier = [{ id: "job-1", title: "QA Automation Engineer", description: text }];
    const repost = { title: "QA automation engineer", description: text.replace("two years", "2 years") };
    expect(similarity(text, repost.description)).toBeGreaterThan(0.9);
    expect(repostOf(repost, earlier)).toBe("job-1");
  });

  it("needs the same title and enough text", () => {
    const earlier = [{ id: "job-1", title: "QA Automation Engineer", description: text }];
    expect(repostOf({ title: "QA Team Lead", description: text }, earlier)).toBe("");
    expect(repostOf({ title: "QA Automation Engineer", description: "Short." }, [{ ...earlier[0], description: "Short." }])).toBe("");
  });
});
