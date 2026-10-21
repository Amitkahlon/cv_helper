// Local date as YYYY-MM-DD (toISOString would give the UTC date).
export function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return formatDate(new Date());
}

// "10 hours ago", "2 days ago", "3 weeks ago", "1 month ago" -> approximate YYYY-MM-DD,
// or "" if the text isn't in that form.
export function relativeToDate(text: string, now: Date): string {
  const match = text.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
  if (!match) return "";
  const n = Number(match[1]);
  const d = new Date(now);
  switch (match[2].toLowerCase()) {
    case "minute":
      d.setMinutes(d.getMinutes() - n);
      break;
    case "hour":
      d.setHours(d.getHours() - n);
      break;
    case "day":
      d.setDate(d.getDate() - n);
      break;
    case "week":
      d.setDate(d.getDate() - 7 * n);
      break;
    case "month":
      d.setMonth(d.getMonth() - n);
      break;
    case "year":
      d.setFullYear(d.getFullYear() - n);
      break;
  }
  return formatDate(d);
}
