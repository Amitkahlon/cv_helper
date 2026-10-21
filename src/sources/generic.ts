import * as cheerio from "cheerio";
import { chromium } from "playwright";
import type { AiProvider } from "../ai/provider.js";
import { object, STRING } from "../ai/schema.js";
import { formatDate } from "../dates.js";
import { JobNotFoundError, type ScrapedJob } from "../job.js";

// Any other job page (Workday, Comeet, Greenhouse, company career pages, ...),
// plan section 5: the page's own schema.org JobPosting data when it has it,
// otherwise its readable text, which the AI turns into job details.

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MIN_TEXT = 600; // less readable text than this: the page is probably built by JavaScript
const MAX_TEXT = 40_000; // page text sent to the AI (job pages are far shorter; this cuts navigation noise)
const CLOSED_TEXT = /no longer accepting|position (has been|is) (filled|closed)|job (is )?no longer available|this job has expired/i;

const EXTRACT_SCHEMA = object({
  is_job_posting: { type: "boolean" },
  title: STRING,
  company: STRING,
  location: STRING,
  posted_date: STRING,
  closed: { type: "boolean" },
  employment_type: STRING,
  description: STRING,
});

const EXTRACT_SYSTEM = `You read the text of a web page that should be one job posting.
- is_job_posting: false if the page is not a single job posting (a list of jobs, an error, a login page).
- title, company, location: as the page states them ("" if not stated).
- posted_date: YYYY-MM-DD if the page gives a date, else "".
- closed: true only if the page says the job is closed or no longer accepting applications.
- employment_type: as stated (e.g. "Full-time"), else "".
- description: the full posting text (role, responsibilities, requirements, benefits) copied as written,
  without site navigation, cookie notices or other jobs. Keep the posting's language.`;

export async function fetchGenericJob(url: string, ai: () => Promise<AiProvider>): Promise<ScrapedJob> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if (response.status === 404 || response.status === 410) throw new JobNotFoundError(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  let html = await response.text();

  const fromData = parseJobPostingData(html, new Date());
  if (fromData) return fromData;

  // Little text in the raw page: let a browser run the page's JavaScript first.
  if (pageText(html).length < MIN_TEXT) {
    html = await renderedHtml(url);
    const rendered = parseJobPostingData(html, new Date());
    if (rendered) return rendered;
  }

  const text = pageText(html).slice(0, MAX_TEXT);
  if (!text) throw new Error("The page has no readable text");
  const answer = await (await ai()).generateJson<ScrapedJob & { is_job_posting: boolean }>({
    system: EXTRACT_SYSTEM,
    prompt: `Page address: ${url}\n\nPage text:\n${text}`,
    schema: EXTRACT_SCHEMA,
  });
  if (!answer.is_job_posting) throw new Error("This page doesn't look like a single job posting");
  return {
    title: answer.title,
    company: answer.company,
    location: answer.location,
    posted_date: /^\d{4}-\d{2}-\d{2}$/.test(answer.posted_date) ? answer.posted_date : "",
    closed: answer.closed || CLOSED_TEXT.test(text),
    employment_type: answer.employment_type,
    seniority: "",
    description: answer.description,
    employer_link: "",
  };
}

// The job from the page's schema.org JobPosting data (JSON-LD), if it has some.
export function parseJobPostingData(html: string, now: Date): ScrapedJob | null {
  const $ = cheerio.load(html);
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    let data: unknown;
    try {
      data = JSON.parse($(script).text());
    } catch {
      continue;
    }
    const posting = findPosting(data);
    if (!posting?.title) continue;

    const places = ([] as any[]).concat(posting.jobLocation ?? []);
    const location = places
      .map((place) => {
        const a = place?.address ?? {};
        return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ");
      })
      .filter(Boolean)
      .join("; ");
    const remote = posting.jobLocationType === "TELECOMMUTE" ? "Remote" : "";
    const validThrough = posting.validThrough ? new Date(posting.validThrough) : null;

    return {
      title: text(posting.title),
      company: text(posting.hiringOrganization?.name ?? posting.hiringOrganization),
      location: [location, remote].filter(Boolean).join(" · "),
      posted_date: posting.datePosted ? formatDate(new Date(posting.datePosted)) : "",
      closed: !!validThrough && !isNaN(validThrough.getTime()) && validThrough < now,
      employment_type: ([] as string[]).concat(posting.employmentType ?? []).join(", ").replace(/_/g, "-").toLowerCase(),
      seniority: "",
      description: htmlToText(String(posting.description ?? "")),
      employer_link: "",
    };
  }
  return null;
}

// JSON-LD may hold one object, a list, or an @graph; find the JobPosting in it.
function findPosting(data: any): any {
  if (Array.isArray(data)) return data.map(findPosting).find(Boolean);
  if (!data || typeof data !== "object") return null;
  const type = ([] as string[]).concat(data["@type"] ?? []);
  if (type.includes("JobPosting")) return data;
  return data["@graph"] ? findPosting(data["@graph"]) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// HTML (a description, or a whole page) as plain text with line breaks kept.
export function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const root = $("#root");
  root.find("script, style, noscript, svg").remove();
  root.find("br").replaceWith("\n");
  root.find("li").each((_, li) => {
    $(li).prepend("- ").append("\n");
  });
  root.find("p, div, h1, h2, h3, h4, ul, ol, section, tr").each((_, block) => {
    $(block).append("\n");
  });
  return root
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A page's readable text, without its navigation, header, footer and scripts.
export function pageText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, header, footer, iframe, form").remove();
  return htmlToText($("body").html() ?? "");
}

async function renderedHtml(url: string): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (response && (response.status() === 404 || response.status() === 410)) throw new JobNotFoundError(url);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    return await page.content();
  } finally {
    await browser.close();
  }
}
