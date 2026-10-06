import { chromium, errors, type BrowserContext, type Page, type Response } from "playwright";
import type { ScrapedJob } from "../job.js";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export class JobNotFoundError extends Error {}

export interface HiremeResult {
  job: ScrapedJob;
  loggedOut: boolean; // the site answered as if we weren't logged in
}

// Opens a visible Chromium with cvhelper's own profile and waits until the user
// is logged in to HireMe. The login is remembered in the profile.
export async function openHiremeBrowser(
  profileDir: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    locale: "he-IL",
    viewport: { width: 1200, height: 850 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://hiremetech.com/", { waitUntil: "commit" });
  await page.waitForTimeout(2000);

  if (!(await isLoggedIn(page))) {
    console.log(
      "\n>>> Log in to HireMe in the browser window that just opened. " +
        "cvhelper continues by itself once you're in.\n",
    );
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (!(await isLoggedIn(page))) {
      if (page.isClosed()) throw new Error("The browser window was closed before login finished.");
      if (Date.now() > deadline) {
        await context.close();
        throw new Error("Gave up waiting for the HireMe login.");
      }
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2000); // let the site finish its post-login redirect
  }
  return { context, page };
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    return Boolean(await page.evaluate("!!localStorage.getItem('auth_token')"));
  } catch {
    return false; // page is mid-navigation, e.g. a Google login redirect
  }
}

// Opens the job page and takes the job JSON the page itself requests, so we get
// what a logged-in user sees (company name, the employer's apply link).
export async function fetchHiremeJob(page: Page, id: string): Promise<HiremeResult> {
  const isJobApi = (r: Response) =>
    r.request().method() === "GET" && new RegExp(`/api/jobs/${id}(?:\\?|$)`).test(r.url());
  let data: unknown;
  try {
    const [response] = await Promise.all([
      page.waitForResponse(isJobApi, { timeout: 60_000 }),
      page.goto(`https://hiremetech.com/job/${id}`, { waitUntil: "commit" }),
    ]);
    if (response.status() === 404) throw new JobNotFoundError(id);
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    data = await response.json();
  } catch (err) {
    if (!(err instanceof errors.TimeoutError)) throw err;
    data = await fetchLoggedOut(id); // the page never asked for the job
  }
  return parseHiremeJob(data);
}

async function fetchLoggedOut(id: string): Promise<unknown> {
  const response = await fetch(`https://hiremetech.com/api/jobs/${id}`);
  if (response.status === 404) throw new JobNotFoundError(id);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Turns HireMe's job JSON into our fields.
export function parseHiremeJob(data: any): HiremeResult {
  const d = data?.job ?? {};
  const location = d.location?.basic ?? {};
  return {
    job: {
      title: str(d.title),
      company: str(d.company_name) || str(d.company?.name),
      location: str(location.display_name) || str(location.city),
      posted_date: str(d.posted_date),
      closed: !(d.is_active && d.accepting_applications),
      employment_type: str(d.employment_type),
      seniority: str(d.job_level),
      description: [str(d.description), str(d.requirements)].filter(Boolean).join("\n\n"),
      employer_link: employerLink(d),
    },
    loggedOut: Boolean(d.requires_login),
  };
}

// Logged out, job_url just points back at HireMe, and on-site jobs sometimes
// carry an internal slug instead of a URL (lesson 9.12), so only real external
// links count.
function employerLink(d: any): string {
  for (const candidate of [d.apply_url, d.job_url]) {
    if (
      typeof candidate === "string" &&
      /^(https?:\/\/|mailto:)/.test(candidate) &&
      !candidate.includes("hiremetech.com")
    ) {
      return candidate;
    }
  }
  return d.application_email ? `mailto:${d.application_email}` : "";
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
