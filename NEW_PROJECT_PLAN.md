# CV Submit Helper — Project Plan

A command-line tool that cuts the time it takes to apply for jobs: it collects job postings into one
tracker, builds a tailored CV per job (or picks one of the user's ready-made CVs), and walks the user
through submitting them.

This plan is the starting brief for a new project. It is based on a working prototype ("jobhunter")
that did all three parts for one user and one job site. Section 9 lists what that prototype taught us;
read it before writing scrapers or the apply step.

Build it slowly: one phase at a time (section 8), each one usable on its own before the next starts.

---

## 1. Goals and scope

**For:** job seekers in any field, not only tech. Nothing in the data model, prompts or filters may
assume a tech CV (no hard-coded "projects", "tech stack", GitHub, etc.).

**Three features:**

1. **Add jobs** — paste links (an agency page such as HireMe, or the employer's own posting), and the
   tool fetches each job into the tracker, without duplicates.
2. **Build CVs** — from a profile the user sets up once, produce one tailored PDF per job (or choose a
   predefined CV), plus a requirements checklist and a simple score. Jobs the user doesn't want are
   filtered out with a reason.
3. **Submit helper** — go through the jobs not yet applied to: show details and score, open the links
   and the CV folder, record the outcome. Works on Windows and Linux.

**Not now (future):** a UI, a Chrome extension, sharing scraped postings between users via a server.
Keep these in mind only as far as not blocking them: the core logic should live in a library with the
CLI as a thin layer on top, so a UI or extension can reuse it later.

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
- **AI provider behind a small interface.** Version 1 uses the **Claude Code CLI** in headless mode
  (`claude -p --output-format json --json-schema ... --tools ""`), which runs on the user's Claude
  subscription with no API key — the same approach the prototype used. Run it from a temporary folder
  so it only sees what is in the prompt. An Anthropic API implementation can be added later behind the
  same interface.
- Node's built-in modules for everything else where reasonable.

---

## 3. Workspace layout

Everything for one user lives in one folder (path set in config), separate from the code:

```
<workspace>/
  config.yaml              settings, filters, paths, CV mode
  jobs.csv                 the tracker — the only list of jobs, and the source for duplicate checks
  profile/
    profile.yaml           facts about the user, as structured fields (see 6)
    rules.md               the user's own rules for CVs ("never claim X", "one page", ...)
    example_cv.pdf         the user's current CV, used to seed the profile and the style
    cvs/                   predefined CVs (only in "predefined" mode) + cvs.yaml describing each
  jobs/
    <id>/                  one folder per job, ASCII-only name (see 9.6)
      job.md               full posting text as scraped
      job.json             structured data: title, company, requirements list, metadata
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
| `submitted` | user / submit helper | empty = not submitted, `YES` = submitted |
| `notes` | user | free text; the submit helper can append to it |
| `score` | CV builder | e.g. `3/5` — must-have requirements met |
| `filter` | add / CV builder | empty = OK, or `rejected: <reason>` |
| `cv_status` | CV builder | empty, `built`, `predefined: <name>`, `error: ...`; user types `build` to force a (re)build |
| `title` | add | job title |
| `company` | add | company name |
| `location` | add | city / remote / hybrid |
| `requirements` | add | short `;`-separated must-have list, for reading at a glance |
| `job_link` | add | the employer's posting / apply page |
| `agency_link` | add | the agency page (HireMe etc.), empty for direct jobs |
| `cv_file` | CV builder | path to the PDF, relative to the workspace |
| `posted_date` | add | from the posting, if available |
| `first_seen` | add | date the tool first added it |
| `submitted_date` | submit helper | date marked `YES` |
| `phone_call_date` | user | date of the first phone call; empty = none yet |
| `interview_date` | user | date of the first interview; empty = none yet (later rounds go in `notes`) |
| `rejected_date` | user | date of the rejection; empty = not rejected |
| `offer_date` | user | date an offer was made; empty = none yet |
| `id` | add | internal id, always set, used for the folder name |
| `source_job_id` | add | the site's own job id, may be empty |

`id` is always generated (the user's "job id can be empty" applies to `source_job_id`): folders,
commands and duplicate checks need a stable key even when a site has no id.

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

### Requirements extraction — one structured list, used everywhere

After fetching, every job (whatever the source) goes through one AI step that turns the posting into
`job.json`:

```json
{
  "title": "...", "company": "...", "location": "...", "work_model": "onsite|hybrid|remote",
  "employment_type": "full-time|part-time|student|internship|contract|temporary",
  "seniority": "entry|junior|mid|senior|lead", "min_years_experience": 2,
  "field": "short label, e.g. 'software QA', 'accounting', 'nursing'",
  "must_have": [{"id": "R1", "text": "2+ years with SQL"}, ...],
  "nice_to_have": [{"id": "N1", "text": "Experience with Azure"}, ...],
  "language_requirements": ["Hebrew", "English"],
  "asks_for_attachments": ["transcript", "portfolio"]
}
```

This one extraction feeds three things: the filters (employment type, field, seniority, years), the
score (`must_have`), and the CV builder, which gets the requirements and metadata instead of the full
description — the user's idea of keeping context small. The builder may still read `job.md` when the
structured data is thin (some postings are one line).

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
The submit helper and the CV builder skip rows with a non-empty `filter`. Description-similarity repost detection (same job reposted under a new id)
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
- `preferences` — target roles/fields, seniority, locations, work model, accepted job types

Why structured: the CV builder needs exact facts it cannot rewrite (titles, dates, links), and a planned
future feature — **auto-filling application forms** — needs exact values (first name, phone, years of
experience, notice period, salary expectation, work authorization). Both read the same file. Expect the
`personal` section to grow a lot for form-filling later; unknown fields simply stay empty.

### Profile setup (`cvhelper init`) — open, start simple

How much the setup asks interactively is **not decided yet**. Start with the minimum:

1. Import the user's current CV (PDF/DOCX): the AI fills a draft `profile.yaml` in the sections above.
2. The user reviews and corrects it in their editor. It is the only source of truth: everything true,
   nothing else.
3. Create `rules.md` with defaults (no invented facts, one page, keep dates and titles exact) for the
   user to extend, and a `config.yaml` with commented defaults (mode, filters, paths).

A guided interview (questions about each job, project, preference), or importing extra documents, can
come later.

### Two modes

- **generate** — the AI picks and words content from `profile.yaml` for each job; a fixed template renders
  it. Names, titles, dates, contact details and links come from the profile as fixed data, never
  rewritten by the AI (see 9.8).
- **predefined** — the user supplies several finished CVs, each with a one-line description of the jobs
  it suits (in `profile/cvs/cvs.yaml`). For each job the AI picks the best one and copies it into the
  job folder under the standard file name. No rendering; still produces the checklist and score.

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

### Command

`cvhelper build` — all jobs without a `cv_status` that aren't submitted or filtered.
Options: `--limit N`, `--only <id> ...`, `--force`.

---

## 7. Feature 3 — submit helper

`cvhelper apply` walks through jobs where `submitted` is empty and a CV exists (`--all` to include the
rest). For each job it shows title, company, location, score, the checklist summary and notes; opens the
CV folder; opens the job link (and the agency link) in the browser.

Keys:

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

**Phase 1 — add jobs (HireMe + generic).** Link parsing from pasted text, normalized link keys and the
duplicate check, the HireMe adapter, the generic fallback (JSON-LD → text → AI), requirements extraction
into `job.json`, closed-job detection. *Done when:* pasting a real HireMe list and a list of direct links
fills the CSV correctly with no duplicates on a second run.

**Phase 2 — profile and CV builder (generate mode).** `cvhelper init` (CV import only), the template, `cvhelper build`,
one-page check, checklist and score, rule-based filters. *Done when:* the user sends CVs built by it.

**Phase 3 — submit helper.** `cvhelper apply` with `s` / `n` (+ note) / `o` / `q`, on Windows and Linux.

**Phase 4 — more control.** `g` (regenerate with instructions), AI field filter, predefined-CV mode,
the `event` command for status dates.

**Phase 5 — more site adapters.** Comeet, Lever, Greenhouse, Workday, LinkedIn — one at a time, each
with a saved sample page as a test fixture. Description-similarity repost detection.

**Later.** UI, Chrome extension, shared scraping server.

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
3. **Long text** — short requirements summary in the CSV; full posting in `jobs/<id>/job.md` (section 3).
4. **Duplicate check** — normalized links (tracking parameters removed, known sites reduced to their job
   id), compared with both `job_link` and `agency_link`. Description-similarity check in a later phase.
5. **All jobs in the CSV** — closed, filtered and repost jobs are rows with the reason in `filter`; the
   CSV is the only "seen before" list.
6. **Profile** — structured `profile.yaml` with explicit sections (experience, projects, education,
   skills, ...), also meant for future form auto-fill (section 6).
7. **One command** with subcommands: `init`, `add`, `build`, `apply`; `add` detects agency vs direct
   links per link.
8. **AI service** — Claude Code CLI for version 1.
9. **Language** — TypeScript on Node.js (section 2).

**Open**

1. **Project name** — `cvhelper` is a placeholder; rename before publishing.
2. **Profile setup flow** — start with CV import only; a guided interview and the extra details needed
   for form auto-fill come later (section 6).
