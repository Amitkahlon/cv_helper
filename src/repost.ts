// Repost detection (lesson 9.4): the same job posted again under a new id has
// the same description. Employers reuse one text for several teams or places,
// so the title must match too.

const SIMILAR = 0.85;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

// How alike two texts are, from 0 to 1 (shared words over all words).
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const word of wa) if (wb.has(word)) shared++;
  return shared / (wa.size + wb.size - shared);
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

// The id of an earlier job this one reposts, or "".
export function repostOf(
  job: { title: string; description: string },
  earlier: { id: string; title: string; description: string }[],
): string {
  if (job.description.trim().length < 200) return ""; // too short to tell
  return earlier.find((e) => sameTitle(e.title, job.title) && similarity(e.description, job.description) >= SIMILAR)?.id ?? "";
}
