import { createHash } from "node:crypto";
import type { JobRow } from "./jobsCsv.js";

export interface LinkInfo {
  key: string; // the same for every link shape of one job; used for duplicate checks
  site: string; // "linkedin", "hireme", or "other" for sites without special handling yet
  siteJobId?: string; // the site's own job id, when the link has one
}

// Query parameters that only track where a click came from.
const TRACKING_PARAM = /^(utm_\w+|ref|refid|trk|trackingid|shared_id|lever-via|fbclid|gclid)$/i;

export function linkInfo(link: string): LinkInfo {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return { key: link.trim(), site: "other" };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  // /jobs/view/4475368276, /jobs/view/devops-engineer-at-malamteam-4475368276,
  // or a search page with ?currentJobId=4475368276
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    const id =
      url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1] ??
      url.searchParams.get("currentJobId");
    if (id && /^\d+$/.test(id)) {
      return { key: `linkedin:${id}`, site: "linkedin", siteJobId: id };
    }
  }

  // hiremetech.com/job/149714539, juniors.hiremetech.com/job/149714539,
  // or with a language prefix: hiremetech.com/he-il/job/149714539
  if (host === "hiremetech.com" || host.endsWith(".hiremetech.com")) {
    const id = url.pathname.match(/^\/(?:[a-z]{2}-[a-z]{2}\/)?job\/(\d+)/i)?.[1];
    if (id) return { key: `hireme:${id}`, site: "hireme", siteJobId: id };
  }

  // Any other site: drop tracking parameters, the #fragment, "www." and
  // trailing slashes, and sort the remaining parameters.
  for (const name of [...new Set(url.searchParams.keys())]) {
    if (TRACKING_PARAM.test(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  const path = url.pathname.replace(/\/+$/, "");
  return { key: `${host}${path}${url.search}`, site: "other" };
}

// The job's id, also its folder name: "linkedin-4475368276", or
// "job-<10 hex characters>" for links without a site job id.
export function jobIdFor(info: LinkInfo): string {
  if (info.siteJobId) return `${info.site}-${info.siteJobId}`;
  return "job-" + createHash("sha1").update(info.key).digest("hex").slice(0, 10);
}

// Keys of every job already in the tracker, from both link columns.
export function knownKeys(rows: JobRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const link of [row.job_link, row.agency_link]) {
      if (link) keys.add(linkInfo(link).key);
    }
  }
  return keys;
}
