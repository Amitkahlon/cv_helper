// Hosts whose links are never jobs. A link is skipped if its host is one of
// these or a subdomain of one (e.g. "referally.setmore.com" matches "setmore.com").
const BLOCKED_HOSTS = [
  "referally.link",
  "setmore.com",
  "chat.whatsapp.com",
  "wa.me",
];

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
// WhatsApp formatting and punctuation that can stick to the end of a link.
const TRAILING_JUNK = /[*_~.,;:!?)\]}>'"]+$/;

export interface ExtractedLinks {
  jobLinks: string[];
  skipped: string[];
}

export function extractJobLinks(text: string): ExtractedLinks {
  const jobLinks: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(URL_PATTERN)) {
    const link = match[0].replace(TRAILING_JUNK, "");
    if (seen.has(link)) continue;
    seen.add(link);

    if (isBlocked(link)) skipped.push(link);
    else jobLinks.push(link);
  }

  return { jobLinks, skipped };
}

function isBlocked(link: string): boolean {
  let host: string;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return true; // not a valid URL
  }
  return BLOCKED_HOSTS.some(
    (blocked) => host === blocked || host.endsWith("." + blocked),
  );
}
