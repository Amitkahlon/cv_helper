# CV Submit Helper — Project Plan

A local tool (web UI + command line) that cuts the time it takes to apply for jobs: it collects job
postings into one tracker, builds a tailored CV per job (or picks one of the user's ready-made CVs), and
walks the user through submitting them.

This plan is the starting brief for a new project. It is based on a working prototype ("jobhunter")
that did all three parts for one user and one job site. Section 9 lists what that prototype taught us;
read it before writing scrapers or the apply step.

Build it slowly: one phase at a time (section 8), each one usable on its own before the next starts.

**Status (2026-10-21):** phases 0–8 are built (on the `ui` branch): adding jobs from LinkedIn, HireMe and
any job page; the web UI (Jobs, Apply, Profile, CVs, Stats, Settings); the AI layer with six providers;
profile import, follow-up questions and target roles; a CV library; tailored and predefined CVs with
checklist and score; the apply wizard; the Chrome extension; filters, statistics and a demo workspace.
See the README for how to use it. Still open: sharing scraped postings between users, description-based
repost detection, form auto-fill in the extension, and the open decisions in section 10.

---

## 1. Goals and scope

**For:** job seekers in any field, not only tech. Nothing in the data model, prompts or filters may
assume a tech CV (no hard-coded "projects", "tech stack", GitHub, etc.).

**Who it's for now:** a personal tool for the author, built so it can be showcased and possibly turned
into a product later. That means: an AI provider interface from the start, a demo workspace with sample
data, and an English UI built so Hebrew can be added — but polished installing comes only before
showcasing.

**Core:** the logic lives in a library; the CLI and the web UI are thin layers on top of it, so a
Chrome extension can reuse it too.

### Features

**A. Jobs**
- A1. Paste WhatsApp messages or links → jobs are read into the tracker, without duplicates.
- A2. Sources: HireMe and LinkedIn first, then Comeet, Lever, Greenhouse, Workday, and any job page.
- A3. Closed and unwanted jobs are kept but filtered out with a reason (closed, internship, wrong field,
  too senior, ...).
- A4. Requirements pulled out of each posting (must-have / nice-to-have, years, field, languages).

**B. Tracker UI** (section 7)
- B1. An Excel-like list of jobs with a **V checkbox** for "submitted".
- B2. Sort, filter and search; a job details panel; event dates (phone call, interview, rejection,
  offer).
- B3. Buttons for "Add jobs" and "Create CV" (per job or for the selected jobs), with live progress.
- B4. The CLI commands stay for quick use.

**C. Profile** (section 6)
- C1. One profile per person, with **target roles** ("QA automation", "Backend developer", ...)
  instead of separate profiles per role.
- C2. A **guided walkthrough** that asks about experience, projects, education, skills and preferences.
- C3. Import an existing CV (PDF/DOCX) to pre-fill the profile.
- C4. The user's own rules ("never claim X", "one page").

**D. CVs** (section 6)
- D1. **Tailored CV** per job, built from the profile.
- D2. **Predefined CVs**, each linked to a target role.
- D3. **CV choice per job**: the AI suggests "predefined CV X" or "tailored, with role Y's emphasis";
  the user can change it per job before building.
- D4. A requirements checklist per job (met / partly / not met) and a score.
- D5. A summary of what was changed in a tailored CV.

**E. Applying** (section 7)
- E1. **Apply wizard** in the UI: goes through the jobs not yet applied to, opens the job site, shows
  the CV summary and changes, and which requirements are met or missing.
- E2. Easy CV upload: the CV folder opens with the file already selected, and the CV's full path is
  copied to the clipboard (paste it into the site's file picker).
- E3. **Chrome extension** that puts the CV straight into the site's upload field; form auto-fill from
  the profile later.

**F. AI providers** (section 2)
- F1. Choice of provider: Claude, ChatGPT, Gemini.
- F2. Two ways to connect each one: its CLI on the user's subscription (no key), or an API key.

**G. Later**
- Statistics: response rate, days to the first call, which sources respond best.
- Switching between workspaces (different people) in the UI.
- Sharing scraped postings between users via a server.

### What makes it different

Tools like Teal, Huntr and Simplify already track jobs, tailor CVs and auto-fill forms. This one:
reads the sources job seekers in Israel actually use (WhatsApp groups, HireMe) with Hebrew support; works
for any field, not only tech; runs on the user's own computer with an AI subscription they already pay
for; and puts honesty first — it never claims what the profile doesn't have and lists the gaps instead
(lessons 9.8–9.9).

---

## 2. Tech choices

- **TypeScript on Node.js (current LTS)**, installed as a package with one command entry point (e.g.
  `cvhelper`, via the `bin` field in `package.json`), so the user never types `node dist/script.js`.
  `npm install -g .` or `npm link` on both OSes.
- **Playwright** (headless Chromium) for pages that need JavaScript and for HTML → PDF rendering.
- **pdf-lib** for page counting and merging attachments.
- **Zod** for the job, requirement, profile and config schemas (also converted to JSON Schema for the
  AI output schema).
- **csv-parse / csv-stringify** for the tracker, **yaml** for config.
- **YAML** for config; **CSV (UTF-8 with BOM)** for the tracker so Excel shows non-English text.
- **AI provider behind a small interface**, so the user can choose Claude, ChatGPT or Gemini, each
  either through its CLI on the user's subscription (Claude Code, Codex CLI, Gemini CLI — no API key)
  or through an API key. Version 1 implements only the **Claude Code CLI** in headless mode
  (`claude -p --output-format json --json-schema ... --tools ""`) — the same approach the prototype
  used. Run it from a temporary folder so it only sees what is in the prompt. The other providers come
  later behind the same interface.
- **Web UI as a local app**: `cvhelper ui` starts a small server inside cvhelper, listening only on
  `127.0.0.1`, and opens the page in the user's normal browser. The server is what lets the page read
  and write the workspace, build CVs, read job sites and open folders — a page alone can't. The page's
  framework (React + Vite or plain HTML/JS) is decided when the UI phase starts.
- Node's built-in modules for everything else where reasonable.

---

## 3. Workspace layout

Everything for one user lives in one folder (path set in config), separate from the code:

```
<workspace>/
  config.yaml              settings, filters, paths, AI provider
  jobs.csv                 the tracker — the only list of jobs, and the source for duplicate checks
  profile/
    profile.yaml           facts about the user, as structured fields (see 6)
    roles.yaml             target roles: which jobs each fits, emphasis notes
    rules.md               the user's own rules for CVs ("never claim X", "one page", ...)
    example_cv.pdf         the user's current CV, used to seed the profile and the style
    cvs/                   the CV library: ready-made CVs (PDF/DOCX)
    cvs.yaml               each library CV's name, category (e.g. a role's name) and what it's for
  jobs/
    <id>/                  one folder per job, ASCII-only name (see 9.6), e.g. linkedin-4475368276
      job.json             scraped details, full description, and the AI-filled requirements object
      <Name>_CV.pdf        the CV for this job
      checklist.md         requirements met / not met, score, what was adapted
```

**Decided — long text stays out of the CSV.** The CSV is what the user opens and edits; full
descriptions make rows unreadable, break in Excel (32k character cell limit, multi-line cells) and are
easy to damage by hand. The CSV keeps a short requirements summary; the full text and the structured
requirements live in `jobs/<id>/`.

---

## 4. The tracker (`jobs.csv`)

### Columns

| Column | Filled by | Meaning |
|---|---|---|
| `submitted` | user / UI checkbox / apply wizard | empty = not submitted, `YES` = submitted |
| `notes` | user | free text; the apply wizard can append to it |
| `score` | CV builder | e.g. `3/5` — must-have requirements met |
| `filter` | add / CV builder | empty = OK, or `rejected: <reason>` |
| `cv_choice` | AI / user | `predefined: <library CV file>` or `tailored: <role>`; picked in the UI (later also suggested by the AI) |
| `cv_status` | CV builder | empty, `built`, `error: ...`; user types `build` to force a (re)build |
| `title` | add | job title |
| `company` | add | company name |
| `location` | add | city / remote / hybrid |
| `requirements` | add | short `;`-separated must-have list, for reading at a glance |
| `job_link` | add | the employer's posting / apply page |
| `agency_link` | add | the agency page (HireMe etc.), empty for direct jobs |
| `cv_file` | CV builder | path to the PDF, relative to the workspace |
| `posted_date` | add | from the posting, if available |
| `first_seen` | add | date the tool first added it |
| `submitted_date` | UI checkbox / apply wizard | date marked `YES` |
| `phone_call_date` | user | date of the first phone call; empty = none yet |
| `interview_date` | user | date of the first interview; empty = none yet (later rounds go in `notes`) |
| `rejected_date` | user | date of the rejection; empty = not rejected |
| `offer_date` | user | date an offer was made; empty = none yet |
| `id` | add | internal id, always set, used for the folder name |
| `source_job_id` | add | the site's own job id, may be empty |

`id` is always generated (the user's "job id can be empty" applies to `source_job_id`): folders,
commands and duplicate checks need a stable key even when a site has no id. Format:
`<site>-<site job id>` (e.g. `linkedin-4475368276`); sites without an id get a short code derived from
the link.

### Status tracking (decided)

`submitted` stays a simple `YES` / empty column. Everything after that is one **date column per
event** — a filled date means it happened: `submitted_date`, `phone_call_date`, `interview_date`,
`rejected_date`, `offer_date`.

Chosen over a single "stage" column because it keeps the date of every step, which is what statistics
need later: response rate (submitted → phone call), days from submitting to the first call, how far jobs
get (funnel), and which sources and job types respond best. More than one interview round: the first
date goes in `interview_date`, later rounds in `notes` for now.

### Rules for writing the CSV (learned the hard way, see 9.5)

- Re-read the file right before every write and change only the cells being updated.
- If the file is locked (open in Excel on Windows), say so clearly and don't lose the change.
- Never reorder or drop columns the user added.

---

## 5. Feature 1 — adding jobs

### Command

`cvhelper add <file>` (a text file of pasted links) and `cvhelper add <url> [<url> ...]`.
Input is forgiving: any text containing links — a WhatsApp export, "Title / Company" + link blocks,
bare links. Non-job links (group invites, sign-up pages) are ignored with a note.

### Source adapters

One adapter per site type, each with the same small interface:

```
matches(url) -> bool
job_key(url) -> str          # stable identity for duplicate checks (see below)
fetch(url, browser) -> RawJob  # title, company, location, posted date, text, links, open/closed
```

Order of preference when fetching:

1. **Agency adapter** — HireMe first (the only agency in v1). Gives the agency link, and through it the
   employer's link and apply method.
2. **Site adapters** for common hiring systems, added one at a time: Comeet, Lever, Greenhouse,
   Workday, LinkedIn, SmartRecruiters.
3. **Generic fallback** for any other page:
   a. the page's embedded `JobPosting` data (schema.org JSON-LD — many sites have it, because Google
      reads it), else
   b. the description block if one is marked, else
   c. the page's readable text, sent to the AI to pull out title, company, description, requirements.

### Job details and requirements — one `job.json`, used everywhere

When a job is added, its scraped details and full description go into `jobs/<id>/job.json`, with
`requirements` set to `null`. Then every job (whatever the source) goes through one AI step that reads
the description and fills `requirements`:

```json
{
  "id": "linkedin-4475368276", "source": "linkedin", "source_job_id": "4475368276",
  "job_link": "...", "agency_link": null, "first_seen": "2026-10-06",
  "title": "...", "company": "...", "location": "...", "posted_date": "2026-10-04",
  "closed": false, "employment_type": "Full-time", "seniority": "Entry level",
  "description": "full posting text as scraped",

  "requirements": {
    "work_model": "onsite|hybrid|remote",
    "employment_type": "full-time|part-time|student|internship|contract|temporary",
    "seniority": "entry|junior|mid|senior|lead", "min_years_experience": 2,
    "field": "short label, e.g. 'software QA', 'accounting', 'nursing'",
    "must_have": [{"id": "R1", "text": "2+ years with SQL"}, ...],
    "nice_to_have": [{"id": "N1", "text": "Experience with Azure"}, ...],
    "language_requirements": ["Hebrew", "English"],
    "asks_for_attachments": ["transcript", "portfolio"]
  }
}
```

The top-level fields are what the site gave, as-is; `requirements` is filled by the AI (with normalized
values) and can be redone without fetching the job again. The AI step also writes the short
`;`-separated must-have summary to the CSV's `requirements` column.

This one extraction feeds three things: the filters (employment type, field, seniority, years), the
score (`must_have`), and the CV builder, which gets the requirements and metadata instead of the full
description — the user's idea of keeping context small. The builder may still read the full
`description` when the structured data is thin (some postings are one line).

### Duplicate check

The user asked for a simple link check. Make it a *normalized* link check — still simple, but it
catches the common cases the prototype hit:

- strip tracking parameters (`utm_*`, `ref`, `trk`, `shared_id`, `lever-via`, ...), lowercase the host,
  drop trailing slashes;
- for known sites, reduce to the site's job id (LinkedIn `/jobs/view/<id>`, Lever company+uuid,
  Workday requisition id, Comeet company+position uid, Greenhouse job id) — the same job is shared with
  many differently-shaped links;
- check the new job against both `job_link` and `agency_link` of every row in the CSV, so a job seen
  via HireMe and later via the employer's own page is caught.

**Decided:** every fetched job goes into the CSV, including closed, filtered and repost ones, with the
reason in `filter` (`rejected: closed`, `rejected: internship`, `rejected: duplicate of <id>`). The CSV is
the single source of truth for "seen before" — no separate history file like the prototype had. A link
that matches an existing row is not added again (it is the same row); the add summary just reports it.
The apply wizard and the CV builder skip rows with a non-empty `filter`. Description-similarity repost detection (same job reposted under a new id)
is a later phase.

### Also on add

- Mark closed jobs (agency says so, page returns 404/410, or the page text says "no longer accepting").
- Pause between requests to the same site and retry once on HTTP 429.
- A page that can't be read is reported and not added, so the next run retries it.

---

## 6. Feature 2 — CV builder

### Profile (`profile/profile.yaml`)

The profile is stored as **structured fields**, not free text, with explicit sections:

- `personal` — name, email, phone, city, links (LinkedIn, portfolio, ...), each optional
- `experience` — list of entries: role, organization, start/end dates, location, facts (bullets of
  what was actually done), tools/skills used
- `projects` — list: name, link (optional), description, skills used
- `education` — list: degree/course, institution, dates (optional), grade (optional), notable courses
- `skills` — groups the user names (e.g. "Languages", "Tools", "Clinical skills")
- `certifications`, `languages`, `military_or_service`, `volunteering`, `other`
- `preferences` — seniority, locations, work model, accepted job types (target roles live in
  `roles.yaml`, below)

Why structured: the CV builder needs exact facts it cannot rewrite (titles, dates, links), and a planned
future feature — **auto-filling application forms** — needs exact values (first name, phone, years of
experience, notice period, salary expectation, work authorization). Both read the same file. Expect the
`personal` section to grow a lot for form-filling later; unknown fields simply stay empty.

### Target roles (`profile/roles.yaml`)

One person, several kinds of jobs ("QA automation", "Backend developer", "IT / sysadmin"). Instead of
separate profiles per role — which would have to be kept in sync — the one profile has a short list of
target roles. Each role has:

- a name and a one-line description of which jobs it fits;
- optionally, **emphasis notes** for tailoring ("lead with the Playwright framework project").

Ready-made CVs live in a **CV library** (`profile/cvs/` + `cvs.yaml`): upload several, give each a
category (a target role's name links it to that role) and say which jobs it is for. Any job can use
any library CV.

Different *people* each get their own workspace; switching workspaces in the UI is a later feature.

### Profile setup — CV import plus a guided walkthrough

1. Import the user's current CV (PDF/DOCX): the AI fills a draft `profile.yaml` in the sections above.
2. A **guided walkthrough** (in the UI; the CLI can offer a simple version) goes through each section:
   asks about every job and project, fills gaps the CV import missed, and asks for preferences and
   target roles. Every answer is saved to the structured fields.
3. The user reviews the result. The profile is the only source of truth: everything true, nothing else.
4. Create `rules.md` with defaults (no invented facts, one page, keep dates and titles exact) for the
   user to extend, and a `config.yaml` with commented defaults (filters, paths, AI provider).

Importing extra documents (a portfolio, old CVs) can come later.

### CV choice per job

Each job gets a `cv_choice`, either `predefined: <library CV file>` or `tailored: <role>`:

1. The AI suggests it from the job's requirements and the target roles.
2. The user can change it per job (a dropdown in the UI, or the CSV cell) before building.
3. "Create CV" then does one of:
   - **predefined** — copies the chosen library CV into the job folder under the standard file name.
     No rendering; still produces the checklist and score.
   - **tailored** — the AI picks and words content from `profile.yaml`, guided by the role's emphasis
     notes; a fixed template renders it. Names, titles, dates, contact details and links come from the
     profile as fixed data, never rewritten by the AI (see 9.8).

### Filters (reject jobs the user doesn't want)

Configured in `config.yaml`:

```yaml
filters:
  reject_employment_types: [internship, student, part-time]
  accept_fields: ["software QA", "backend development"]   # empty = any
  max_min_years_experience: 3
  reject_keywords: ["night shifts"]
  locations: ["Tel Aviv", "Center", "remote"]
```

Apply them in two steps: rule-based checks on `job.json` right after adding (cheap, predictable), and an
AI check for "different field than what I asked for" during the build. A rejected job gets
`filter: rejected: <reason>`; typing `build` in `cv_status` overrides it.

### Checklist and score

For every built (or picked) CV, `checklist.md` lists each must-have requirement as met / partly met /
not met, with the profile fact that covers it, then the nice-to-haves, then what was adapted. The score
is simply met must-haves over total, e.g. `3/5`, written to the `score` column. Nothing more
complicated.

### Rendering

Start with one clean built-in template (HTML → PDF via headless Chromium), with font and accent colour
in config. Check the page count with pdf-lib; if it overflows, shrink the font slightly, then ask the AI to
cut. Matching the user's example CV's exact look automatically is a later improvement — v1 uses the
example only for content and as a rough style reference.

### Commands

The "Create CV" button in the UI (per job or for the selected jobs), and on the command line
`cvhelper build` — all jobs without a `cv_status` that aren't submitted or filtered.
Options: `--limit N`, `--only <id> ...`, `--force`.

---

## 7. Feature 3 — the UI and the apply wizard

### Tracker UI

`cvhelper ui` opens the local web app (section 2):

- an Excel-like list of jobs: title, company, location, score, CV choice, posted date, status;
- a **V checkbox** per row: ticking it sets `submitted = YES` and `submitted_date` = today in
  `jobs.csv` (through the same safe CSV helpers); unticking clears both;
- sort, filter ("not applied", "hide rejected") and search;
- a details panel per job: full description, requirements, checklist, links, CV choice, and the event
  dates (phone call, interview, rejection, offer) to fill in;
- an "Add jobs" box (paste WhatsApp messages → the same logic as `cvhelper add`) and "Create CV"
  buttons, both with live progress, since reading jobs and building CVs take time.

`jobs.csv` stays the single source of truth, so the user can still open it in Excel. If Excel has it
locked on Windows, the UI says so and offers to retry.

### Apply wizard

Goes through the jobs where `submitted` is empty and a CV exists. For each job it:

- opens the job link (and the agency link) in the user's normal browser (lesson 9.7);
- shows title, company, score, the CV summary and what was changed, and which requirements are met,
  partly met or missing;
- opens the CV folder **with the CV file selected** (`explorer /select,` on Windows, the file manager's
  equivalent on Linux) so it can be dragged straight into the form, and copies the CV's full path to
  the clipboard so it can be pasted into the site's file picker;
- offers: mark submitted, skip (with an optional note), regenerate the CV with instructions
  ("emphasise the SQL work"), reopen the pages, stop.

A browser page can't put a file into another site's upload field, so true one-click upload needs the
**Chrome extension** (phase 7): it fills the site's upload field with the job's CV, and later fills
form fields from the profile.

### Command-line version

`cvhelper apply` offers the same walk-through in the terminal, with keys:

| Key | Action |
|---|---|
| `s` or ENTER | submitted: `submitted = YES`, `submitted_date` = today, next job |
| `n` | skip; asks for an optional note (appended to `notes`), next job |
| `g` | generate a new CV: asks for instructions ("emphasise the SQL work"), rebuilds this job's CV, shows the new checklist, stays on the job |
| `o` | open the folder and links again |
| `q` | quit |

Later: a way to record events without opening the CSV, e.g. `cvhelper event <id> interview [date]`
(fills `interview_date`, today by default).

Cross-platform: open folders and links with the `open` package (it uses `start` on Windows, `xdg-open`
on Linux, `open` on macOS), optionally a new Chrome window per job.

---

## 8. Phases

Each phase ends with something the user can run for real. Don't start the next one until the current
one has been used on real jobs.

**Phase 0 — skeleton.** Package with the `cvhelper` entry point, config loading, workspace creation,
CSV read/write helpers (section 4 rules), cross-platform open-folder/open-link helpers. Tests for the
CSV helpers.

**Phase 1 — add jobs.** Link parsing from pasted text, normalized link keys and the duplicate check, the
HireMe and LinkedIn readers, the generic fallback (JSON-LD → text), closed-job detection, `cvhelper add`.
*Done when:* pasting a real HireMe list and a list of direct links fills the CSV correctly with no
duplicates on a second run.

**Phase 2 — UI v1.** `cvhelper ui`: the jobs list with the V checkbox, sort / filter / search, the
details panel, the "Add jobs" box with live progress. *Done when:* the user tracks their applications in
the UI instead of Excel.

**Phase 3 — AI layer.** The provider interface with the Claude Code CLI, requirements extraction into
`job.json` (and the CSV summary), the generic fallback's AI step, rule-based filters.

**Phase 4 — profile.** CV import, the guided walkthrough, target roles, `rules.md`.

**Phase 5 — CVs.** CV choice per job (AI suggestion + user override), tailored and predefined CVs, the
template, one-page check, checklist and score, "Create CV" in the UI and `cvhelper build`.
*Done when:* the user sends CVs built by it.

**Phase 6 — apply wizard.** In the UI: open the job site, CV summary and changes, requirements met /
missing, folder with the CV selected, path copied, mark submitted / skip / regenerate. The CLI
`cvhelper apply` version alongside.

**Phase 7 — Chrome extension.** Puts the job's CV into the site's upload field; form auto-fill from the
profile later.

**Phase 8 — more.** More AI providers (ChatGPT, Gemini, API keys), more site adapters (Comeet, Lever,
Greenhouse, Workday — each with a saved sample page as a test fixture), description-similarity repost
detection, statistics, a demo workspace for showcasing, switching workspaces in the UI.

**Later.** Sharing scraped postings between users via a server.

---

## 9. Lessons from the prototype

1. **HireMe** has a public JSON endpoint per job (`https://hiremetech.com/api/jobs/<id>`) with title,
   description, requirements, city, posted date, `is_active` / `accepting_applications`, and
   `apply_source` (`platform` = apply on HireMe, `external`, `linkedin`, `email`). The employer's apply
   link and the company name are only returned to logged-in users.
2. **Don't copy HireMe's login token into a script.** Their requests also need a rotating, time-based
   header computed in their front-end code; reproducing it means working around an anti-bot measure.
   What worked: open the job page in a persistent, logged-in browser profile (the user logs in once) and
   read the JSON response the page itself requests (`/api/jobs/<id>` exactly — not `/can-apply`).
3. **The same job arrives under many links**: `juniors.` subdomain vs main domain, tracking parameters,
   Workday links in different letter case and locale, Comeet's `comeet.com/jobs/...` vs
   `comeet.co/careers-api/...`, Lever with and without `/apply`. Normalize per site (section 5).
4. **Reposts** appear under new ids with the same description. But one employer often uses the same
   text for several locations or teams — when matching by description, require the same title too.
5. **CSV and Excel**: the user edits the file while scripts run. Re-read before every write, change only
   the target cells, handle the locked-file error.
6. **Chrome crashed** (`RESULT_CODE_KILLED_BAD_MESSAGE`) when the user picked a CV from a folder whose
   name mixed Hebrew, an apostrophe and a long dash. Folder names must be ASCII letters, digits, space,
   `.`, `_`, `-` only.
7. **Don't drive the user's browser with Playwright for applying.** A Playwright-launched Chrome
   (sandbox off, automation flags) was the first suspect for that crash. Open links in the user's normal
   browser instead. Note that a script can't close tabs in the user's own Chrome profile; opening each
   job in a new window and letting the user close it worked well.
8. **Keep fixed facts out of the AI's hands.** The AI chooses and words content; names, job titles,
   dates, contact details and links come from structured data the template renders. Validate the AI's
   skill list against the profile's factual sections (not the rules section, which names things the
   user does *not* have) and flag anything unknown in the checklist.
9. **Honesty rules matter** more than tailoring: never claim a skill the profile doesn't have, list
   gaps in the checklist instead. The user's own rules file in the prototype had items like "frame
   language X honestly" and "this tool didn't exist at that job, don't mention it there".
10. **LinkedIn** rate-limits quickly (HTTP 429): pause ~2 s between pages and retry once after ~30 s.
11. **Some sites return garbled characters** (`â€™` instead of `'`); fix common mis-encodings on save.
12. **Agency apply fields aren't always links** — HireMe sometimes puts an internal slug in the apply
    field. Only accept values starting with `http(s)://` or `mailto:`.

---

## 10. Decisions

**Decided**

1. **Status tracking** — `submitted` (`YES`/empty) plus one date column per event: `submitted_date`,
   `phone_call_date`, `interview_date`, `rejected_date`, `offer_date` (section 4).
2. **Requirements** — extracted once, when a job is added, into a structured list (must-have,
   nice-to-have, details) in `jobs/<id>/job.json`; it drives the filters, the score and the CV builder
   (section 5).
3. **Long text** — short requirements summary in the CSV; full posting, scraped details and the
   requirements object in one `jobs/<id>/job.json` (sections 3 and 5).
4. **Duplicate check** — normalized links (tracking parameters removed, known sites reduced to their job
   id), compared with both `job_link` and `agency_link`. Description-similarity check in a later phase.
5. **All jobs in the CSV** — closed, filtered and repost jobs are rows with the reason in `filter`; the
   CSV is the only "seen before" list.
6. **Profile** — structured `profile.yaml` with explicit sections (experience, projects, education,
   skills, ...), also meant for future form auto-fill (section 6).
7. **One command** with subcommands: `init`, `add`, `build`, `apply`, `ui`; `add` detects agency vs
   direct links per link.
8. **AI service** — a provider interface (Claude, ChatGPT, Gemini; CLI or API key); version 1
   implements the Claude Code CLI only (section 2).
9. **Language** — TypeScript on Node.js (section 2).
10. **Job id** — `<site>-<site job id>`, e.g. `linkedin-4475368276`; also the folder name (section 4).
11. **UI** — a local web app served by cvhelper on `127.0.0.1`, opened in the user's normal browser
    (sections 2 and 7).
12. **Target roles instead of profiles** — one profile per person, with target roles in `roles.yaml`;
    different people use different workspaces (section 6).
13. **CV choice per job** — `predefined: <role>` or `tailored: <role>`, suggested by the AI, changeable
    by the user (section 6).
14. **Profile setup** — CV import plus a guided walkthrough (section 6).
15. **Aim** — a personal tool first, built so it can be showcased or turned into a product later
    (section 1).

**Open**

1. **Project name** — `cvhelper` is a placeholder; rename before publishing.
2. **UI page framework** — React + Vite (recommended) or plain HTML/JS; decided when phase 2 starts.
3. **Data store** — `jobs.csv` for now; whether to move to a database (with a CSV export) once the UI
   is the main way of working.
