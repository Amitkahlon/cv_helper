import * as cheerio from "cheerio";
import { relativeToDate } from "../dates.js";
import { JobNotFoundError, type ScrapedJob } from "../job.js";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const RETRY_AFTER_429_MS = 30_000;

// Reads LinkedIn's public job page (no login needed). LinkedIn rate-limits
// quickly, so on HTTP 429 it waits and retries once (lesson 9.10).
export async function fetchLinkedinJob(id: string): Promise<ScrapedJob> {
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`;
  const get = () => fetch(url, { headers: { "User-Agent": USER_AGENT } });
  let response = await get();
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_429_MS));
    response = await get();
  }
  if (response.status === 404 || response.status === 410) throw new JobNotFoundError(id);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseLinkedinJob(await response.text(), new Date());
}

// Turns the job page's HTML into our fields. `now` is needed because LinkedIn
// only says "2 days ago".
export function parseLinkedinJob(html: string, now: Date): ScrapedJob {
  const $ = cheerio.load(html);
  const text = (selector: string) => $(selector).first().text().replace(/\s+/g, " ").trim();

  // "Seniority level" -> "Entry level", "Employment type" -> "Full-time", ...
  const criteria = new Map(
    $(".description__job-criteria-item")
      .toArray()
      .map((item) => [$(item).find("h3").text().trim(), $(item).find("span").text().trim()]),
  );

  return {
    title: text(".top-card-layout__title"),
    company: text(".topcard__org-name-link"),
    location: text(".topcard__flavor--bullet"),
    posted_date: relativeToDate(text(".posted-time-ago__text"), now),
    closed: $(".closed-job").length > 0,
    employment_type: criteria.get("Employment type") ?? "",
    seniority: criteria.get("Seniority level") ?? "",
    description: descriptionText($),
    employer_link: "", // the employer's own apply link is only shown to logged-in users
  };
}

// The description as plain text, keeping paragraphs, line breaks and list items.
function descriptionText($: cheerio.CheerioAPI): string {
  const box = $(".show-more-less-html__markup").first();
  box.find("br").replaceWith("\n");
  box.find("li").each((_, li) => {
    $(li).prepend("- ").append("\n");
  });
  box.find("p, ul, ol").each((_, block) => {
    $(block).append("\n\n");
  });
  return box
    .text()
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
