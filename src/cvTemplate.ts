import type { Config } from "./config.js";
import type { Entry, Profile } from "./profileTypes.js";

// What the AI chooses for a tailored CV. Entries are referred to by their index
// in the profile: names, titles, organizations, dates, contact details and links
// always come from the profile itself, never from the AI (lesson 9.8).
export interface TailoredContent {
  summary: string;
  experience: { index: number; bullets: string[] }[];
  military_or_service: { index: number; bullets: string[] }[];
  volunteering: { index: number; bullets: string[] }[];
  projects: { index: number; description: string }[];
  education: { index: number; notable_courses: string[] }[];
  skills: { group: string; items: string[] }[];
  certifications: number[];
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dates = (start: string, end: string) => [start, end].filter(Boolean).join(" – ");

function entries(title: string, list: Entry[], chosen: { index: number; bullets: string[] }[]): string {
  if (chosen.length === 0) return "";
  const items = chosen.map(({ index, bullets }) => {
    const e = list[index];
    const head = [e.role, e.organization].filter(Boolean).map(escape).join(" — ");
    const where = [dates(e.start, e.end), e.location].filter(Boolean).map(escape).join(" · ");
    return `<div class="item">
      <div class="item-head"><b dir="auto">${head}</b><span class="dates">${where}</span></div>
      ${bullets.length ? `<ul>${bullets.map((b) => `<li dir="auto">${escape(b)}</li>`).join("")}</ul>` : ""}
    </div>`;
  });
  return section(title, items.join(""));
}

const section = (title: string, body: string) => (body ? `<h2>${escape(title)}</h2>${body}` : "");

// The CV as one HTML page. `scale` shrinks all text a little when the CV would
// otherwise run to a second page.
export function renderCvHtml(profile: Profile, content: TailoredContent, style: Config["cv"], scale = 1): string {
  const p = profile.personal;
  const contact = [p.email, p.phone, p.city, ...p.links].filter(Boolean).map(escape).join(" · ");

  const projects = content.projects
    .map(({ index, description }) => {
      const project = profile.projects[index];
      const link = project.link ? ` <span class="dates">${escape(project.link)}</span>` : "";
      return `<div class="item"><b dir="auto">${escape(project.name)}</b>${link}${
        description ? `<div dir="auto">${escape(description)}</div>` : ""
      }</div>`;
    })
    .join("");

  const education = content.education
    .map(({ index, notable_courses }) => {
      const e = profile.education[index];
      const head = [e.degree, e.institution].filter(Boolean).map(escape).join(" — ");
      const extra = [e.grade && `Grade: ${e.grade}`, notable_courses.length && `Courses: ${notable_courses.join(", ")}`]
        .filter(Boolean)
        .map((s) => escape(String(s)))
        .join(" · ");
      return `<div class="item">
        <div class="item-head"><b dir="auto">${head}</b><span class="dates">${escape(dates(e.start, e.end))}</span></div>
        ${extra ? `<div dir="auto">${extra}</div>` : ""}
      </div>`;
    })
    .join("");

  const skills = content.skills
    .filter((g) => g.items.length)
    .map((g) => `<div dir="auto"><b>${escape(g.group)}:</b> ${g.items.map(escape).join(", ")}</div>`)
    .join("");

  const certifications = content.certifications
    .map((i) => profile.certifications[i])
    .map((c) => `<div dir="auto">${[c.name, c.issuer, c.date].filter(Boolean).map(escape).join(" · ")}</div>`)
    .join("");

  const languages = profile.languages
    .map((l) => [l.language, l.level].filter(Boolean).map(escape).join(" (") + (l.level ? ")" : ""))
    .join(" · ");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 13mm 15mm; }
  :root { --accent: ${style.accent_color}; }
  body { margin: 0; font-family: ${style.font}; font-size: ${(style.font_size * scale).toFixed(2)}pt; line-height: 1.3; color: #222; }
  h1 { margin: 0; font-size: 2em; color: var(--accent); }
  .contact { margin: 2px 0 6px; color: #444; }
  .summary { margin: 4px 0 2px; }
  h2 { margin: 9px 0 4px; font-size: 1.08em; color: var(--accent); text-transform: uppercase; letter-spacing: .04em;
       border-bottom: 1.5px solid var(--accent); padding-bottom: 1px; }
  .item { margin: 0 0 5px; break-inside: avoid; }
  .item-head { display: flex; justify-content: space-between; gap: 10px; }
  .dates { color: #555; white-space: nowrap; font-size: .95em; }
  ul { margin: 2px 0 0; padding-left: 1.2em; }
  li { margin: 0 0 1px; }
</style></head><body>
  <h1 dir="auto">${escape(p.name)}</h1>
  <div class="contact">${contact}</div>
  ${content.summary ? `<div class="summary" dir="auto">${escape(content.summary)}</div>` : ""}
  ${entries("Experience", profile.experience, content.experience)}
  ${section("Projects", projects)}
  ${section("Education", education)}
  ${section("Skills", skills)}
  ${entries("Military / national service", profile.military_or_service, content.military_or_service)}
  ${entries("Volunteering", profile.volunteering, content.volunteering)}
  ${section("Certifications", certifications)}
  ${section("Languages", languages ? `<div>${languages}</div>` : "")}
</body></html>`;
}
