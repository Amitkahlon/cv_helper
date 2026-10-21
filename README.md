# cvhelper

A local tool that cuts the time it takes to apply for jobs. Paste job links (or whole WhatsApp messages),
and cvhelper reads each job into one tracker, builds a CV for it (tailored from your profile or picked
from your ready-made CVs), checks it against the job's requirements, and walks you through applying.

It runs on your own computer: a web UI in your normal browser, a command line, and a Chrome extension.
The AI work goes through an AI subscription you already have (Claude Code CLI by default), or an API key.

## Install

Needs Node.js 24 or newer.

```
npm install
npx playwright install chromium     # used to read job pages and to print CVs to PDF
npm run build
npm link                            # makes the `cvhelper` command available
```

For the AI steps, install and log in to one of: the Claude Code CLI (default), the Codex CLI, or the
Gemini CLI; or add an Anthropic, OpenAI or Gemini API key in the Settings tab.

## Start

```
cvhelper init        # choose a workspace folder (your tracker, profile and CVs live there)
cvhelper ui          # opens the app at http://127.0.0.1:4321
```

To look around first with made-up data: `cvhelper demo` and then `cvhelper ui --workspace ~/cvhelper-demo`.

## The app

| Tab | What it does |
|---|---|
| **Jobs** | The tracker, newest jobs first: sort, filter, search, tick **Sent**; choose columns and drag their edges to resize. **Add jobs**: paste messages or links. **Select rows** (Shift-click for a range) to act on many at once: Create CVs (each job's own CV choice, or e.g. tailored for one role), mark submitted, skip, restore, set or suggest the CV choice, extract requirements, delete. Click a job for its details, requirements, CV and checklist, and the dates of calls, interviews, rejections and offers. |
| **Apply** | A wizard through the jobs you haven't applied to: opens the job's site, puts the CV path on the clipboard, shows the CV selected in its folder, shows which requirements you meet. Mark submitted or skip with a note. |
| **Profile** | Your facts, the only source for CVs. The **profile walkthrough** goes through it step by step (import your CV first to fill it); the **CV rules walkthrough** sets the rules every CV follows (length, language, tricky skills, what to leave out and the section order per kind of job) and can start from rules you already have. Both work on a copy and save only at the end. |
| **CVs** | Your ready-made CVs: upload several, give each a category (a target role's name links it to that role) and say what it's for. |
| **Stats** | Response rate, interviews, offers, days to first call, by source and by month. |
| **Settings** | AI provider and model, API keys, job filters, the CV's font and colour, switching workspaces. |

### How a CV is made

Each job has a **CV choice**: one of your ready-made CVs, or **tailored** for one of your target roles.
The AI suggests one if you don't pick. A tailored CV is written from your profile only: the AI chooses
and words the content, while names, job titles, dates, contact details and links come straight from
your profile, and any skill not in your profile is removed and reported. The CV is printed as a
one-page PDF named `<Your_Name>_CV.pdf` in the job's folder, with a checklist of the job's requirements
(met / partly / not met, with the evidence) and a score (must-haves met).

### Where jobs come from

- **LinkedIn** job links: read from LinkedIn's public job page.
- **HireMe** links: read through a logged-in browser profile, so the company and the employer's apply
  link are included. The login is kept in cvhelper's own browser profile (see below).
- **Any other job page** (Workday, Comeet, Greenhouse, company career pages, ...): the page's own job
  data when it has it, otherwise its text, read by the AI.

Duplicates are caught across link shapes (tracking parameters, subdomains, `/apply` pages) and across
sources (a HireMe job whose apply link is a LinkedIn job you already have). Closed jobs are added with
`rejected: closed`.

## Command line

```
cvhelper init                          choose the workspace folder
cvhelper add                           paste messages or links (Enter, then Ctrl+D); adds the jobs
cvhelper links                         paste messages; lists the job links in them
cvhelper requirements [ids] [--limit N] [--all]
cvhelper build [ids] [--limit N] [--instructions "..."]
cvhelper profile import <cv.pdf|cv.docx>
cvhelper ui [--workspace <folder>]
cvhelper demo [folder]
```

## Chrome extensions

There are two; load either (or both) from `chrome://extensions` → Developer mode → Load unpacked.

- **`extension-poc/`** (auto-attach): click a site's upload-resume button and the CV of the job you're
  applying to right now (the Apply tab's current job, or the one picked in its popup) is attached instead
  of the file picker opening. Alt+click for the normal picker; only your own clicks attach the CV. See
  `extension-poc/README.md`.
- **`extension/`** (on demand): the steps below.

The on-demand extension puts the job's CV straight into an application form's upload field, which a web page
can't do by itself.

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the
   `extension/` folder.
2. With `cvhelper ui` running, open a job's application page and click the cvhelper icon. It picks the
   job matching the page (or the Apply wizard's current job). Click **Put my CV into this page**, check
   the form, and send it.

## Your data

Everything for one person is in the workspace folder:

```
<workspace>/
  config.yaml          settings for this workspace (AI provider, filters, CV look)
  jobs.csv             the tracker; open it in Excel any time (UTF-8 with BOM, your own columns are kept)
  profile/             profile.yaml, roles.yaml, rules.md, cvs/ + cvs.yaml (your CV library)
  jobs/<id>/           job.json (the posting and its requirements), <Name>_CV.pdf, cv.json, checklist.md
```

Per-user settings (which workspace, API keys) are in `~/.config/cvhelper/settings.json`
(`%APPDATA%\cvhelper` on Windows), outside the workspace, so a synced workspace never carries keys.
cvhelper's browser profile for HireMe is next to it, in `browser/`.

The local server only answers on `127.0.0.1` and refuses changes sent by other websites.

## Known limits

- **HireMe login**: logging in inside the automated browser may be blocked (Google sign-in in
  particular). A profile that is already logged in can be copied into `~/.config/cvhelper/browser/`.
- **Codex CLI and Gemini CLI providers** haven't been run for real yet; the Claude Code CLI has. The
  API-key providers are tested against the APIs' documented request shapes only.
- **Windows**: the AI CLIs must be installed as `.exe` files (e.g. Claude Code's native installer);
  CLIs installed through npm (`.cmd` files) aren't started.

## Development

```
npm test                 # unit tests (Vitest); one test: npx vitest run -t "name"
npm run build            # server (tsc) + page (Vite) into dist/
npm run dev:ui           # page with instant reload; keep `cvhelper ui` running for the API
```

Code: `src/` is the library, server and CLI; `ui/` is the page (React + Vite); `extension/` is the
Chrome extension. The plan and the decisions behind it are in `NEW_PROJECT_PLAN.md`.
