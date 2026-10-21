import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { htmlToText, pageText, parseJobPostingData } from "./generic.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOW = new Date(2026, 9, 21);

describe("parseJobPostingData", () => {
  it("reads a Workday page's JobPosting data", () => {
    const job = parseJobPostingData(fixture("workday-jsonld.html"), NOW)!;
    expect(job).toMatchObject({
      title: "Software Performance Engineer",
      company: "IL00 Mellanox Technologies, Ltd.",
      location: "Israel, Yokneam, Israel",
      posted_date: "2026-10-12",
      closed: false,
      employment_type: "full-time",
    });
    expect(job.description).toMatch(/^NVIDIA is looking for/);
  });

  it("finds a posting inside @graph and marks expired ones closed", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "Organization", name: "Acme" },
        {
          "@type": "JobPosting",
          title: "QA",
          hiringOrganization: { name: "Acme" },
          jobLocationType: "TELECOMMUTE",
          validThrough: "2026-01-01",
          description: "<p>Test things</p><ul><li>Cypress</li></ul>",
        },
      ],
    })}</script>`;
    const job = parseJobPostingData(html, NOW)!;
    expect(job).toMatchObject({ title: "QA", company: "Acme", location: "Remote", closed: true });
    expect(job.description).toBe("Test things\n- Cypress");
  });

  it("gives null for pages without job data", () => {
    expect(parseJobPostingData("<html><body>Hello</body></html>", NOW)).toBeNull();
  });
});

describe("pageText / htmlToText", () => {
  it("keeps the content and drops navigation and scripts", () => {
    const text = pageText(
      "<html><body><nav>Home | Jobs</nav><h1>QA Engineer</h1><p>We test.</p><script>x()</script><footer>©</footer></body></html>",
    );
    expect(text).toBe("QA Engineer\nWe test.");
    expect(htmlToText("a<br>b")).toBe("a\nb");
  });
});
