import { describe, expect, it } from "vitest";
import { csvRow, jobRecord } from "./add.js";
import { linkInfo } from "./jobKey.js";

const scraped = {
  title: "Junior AI Engineer",
  company: "Edventure.il",
  location: "Herzliya, Israel",
  posted_date: "2026-10-06",
  closed: false,
  employment_type: "full_time",
  seniority: "Junior / Entry Level",
  description: "Edventure is building...",
  employer_link: "https://www.linkedin.com/jobs/view/4474028569/",
};
const info = linkInfo("https://hiremetech.com/job/150190211?utm_source=share84297");

describe("jobRecord / csvRow", () => {
  it("puts the employer link in job_link and HireMe in agency_link", () => {
    const record = jobRecord(
      "hireme-150190211",
      info,
      scraped.employer_link,
      "https://hiremetech.com/job/150190211",
      scraped,
      "2026-10-07",
    );
    expect(record).toMatchObject({
      id: "hireme-150190211",
      source: "hireme",
      source_job_id: "150190211",
      job_link: "https://www.linkedin.com/jobs/view/4474028569/",
      agency_link: "https://hiremetech.com/job/150190211",
      first_seen: "2026-10-07",
      requirements: null,
    });
    expect(record).not.toHaveProperty("employer_link");
    expect(csvRow(record)).toMatchObject({ filter: "", company: "Edventure.il", id: "hireme-150190211" });
  });

  it("marks closed jobs as rejected in the filter column", () => {
    const record = jobRecord("hireme-1", info, "", null, { ...scraped, closed: true }, "2026-10-07");
    expect(csvRow(record).filter).toBe("rejected: closed");
    expect(csvRow(record).agency_link).toBe("");
  });
});
