# Submit an Issue: a Second Card on the Contact Page — Design Spec

**Date:** 2026-10-02
**Branch:** `feat/issue-report-card` (cut from `origin/beta` @ `961326c`)
**Status:** Agreed with the maintainer on 2026-10-02: where reports go, what gates them, and
which credential files them. Nothing is implemented.

## Problem

The only way to report a bug or ask for a feature is the Contact form, which lands in a Gmail
inbox and leaves the maintainer to file GitHub issues by hand. The maintainer runs the project a
few hours a month and wants reports to land on the public tracker directly, where the intake
pipeline planned in issue #192 will read them.

## Decisions

| Question | Decision |
|---|---|
| Where a report goes | A GitHub issue in `grepthink2/grepthink2.0`, plus an email to the maintainer carrying the reporter's email address. The address never appears in the public issue. |
| What gates a submission | Contact's honeypot and rate limit, a school email (`is_school_email`: `.edu` or an institution domain), and the GitHub username must exist. |
| Which credential files it | The existing `GITHUB_TOKEN`, re-issued from the `grepthink2` account as a fine-grained token: only `grepthink2.0`, Issues read and write, Pull requests read, Metadata read. Selected-repository tokens also read every public repository, so the scrum board's PR chips keep working. Issues show "opened by grepthink2". |
| Title | The form has a Title field. GitHub requires one, and a title cut from the first line of a description reads badly in the tracker. |

## What the visitor sees

`/contact` shows two cards in a row: **Get in touch** (unchanged) and **Submit an issue**, in the
same card style. They sit side by side from about 1000px wide and stack below that.

The issue card:

- Eyebrow "Issue", title "Submit an issue", one line of copy: "Found a bug or have a request?
  It goes straight to our public tracker on GitHub."
- **GitHub username**, shown with a `@` prefix. A typed `@` is stripped.
- **School email**, placeholder `you@university.edu`.
- **Title**.
- **Description**: a textarea with a Write / Preview toggle. Preview renders through the shared
  `MarkdownText`, so the visitor sees what the issue body will look like. A hint under the
  field: "Markdown is supported. The issue is public; your email stays private."
- A "Submit issue" button, and the honeypot Contact uses.
- After a successful submit the form clears and shows one of:
  - "Filed as grepthink2.0#123", with the number linking to the issue;
  - "Thanks, your report reached us by email. We'll file it on GitHub ourselves." when GitHub
    could not be reached (see Failure handling);
  - a 400's `detail` verbatim, for the three rejections below;
  - "Something went wrong sending your report. Please try again." for anything else.

The preview is CommonMark. GitHub's tables and task lists render only on GitHub.

## API

`POST /api/issues`. Public, no authentication. `@limiter.limit("5/minute")`, keyed like Contact.

Request body (`IssueReportRequest`):

| Field | Rule |
|---|---|
| `github_user` | required; after trimming and dropping one leading `@`, must match GitHub's username rule: 1–39 characters, letters, digits and single hyphens, no leading or trailing hyphen |
| `email` | required, 3–320 characters |
| `title` | required, 1–120 characters after trimming |
| `description` | required, 1–10,000 characters after trimming; markdown |
| `website` | honeypot, default empty |

Checks run in this order, and each rejection is an `HTTPException(400)` with a fixed `detail`:

1. Honeypot filled: answer as if nothing was filed (`issue_number: null`), send nothing, log at
   INFO. Same policy as Contact.
2. Username shape: "Enter a valid GitHub username."
3. Email shape (Contact's regex) and `is_school_email`: "Use a school email, or send us a note
   through Contact."
4. GitHub user exists, via `GET /users/{login}`: a 404 answers "That GitHub username doesn't
   exist." Any other failure (no token, rate limit, network) skips this check, because the
   same outage would also stop the filing, and the report still reaches the maintainer by email.

Response `IssueReportResponse`: `{ "issue_number": 123 | null, "issue_url": "https://…" | null }`.
Null means the report was emailed but not filed on GitHub.

When neither GitHub nor the email could be reached, the request fails with
`HTTPException(502, "Failed to send your report")`, because nothing reached anyone.

## Backend

A new feature module, `backend/app/issues/`, in the repo's shape:

- `models.py`: `IssueReportRequest` and `IssueReportResponse` (Pydantic; the length bounds
  above are field constraints, so Pydantic answers 422 for them before the controller runs).
- `views.py`: `submit_issue(request, body)` with the rate limit; returns the response model.
- `controller.py`: `submit_issue(*, github_user, email, title, description, website)`: the
  checks, then `github.create_issue`, then `send_email`. Constants: `ISSUE_LABELS = ("from-web",
  "needs-triage")` and the recipient, imported as `CONTACT_RECIPIENT` from
  `app.contact.controller`.
- `github.py`: the two GitHub calls, each behind one function, so a GitHub App could replace the
  token later without touching the controller:
  - `lookup_user(login) -> bool | None`: True or False from a 200 or 404; None when GitHub could
    not be asked.
  - `create_issue(*, title, body, labels) -> tuple[int, str] | None`: the issue number and HTML
    URL, or None when `GITHUB_TOKEN` is unset or GitHub answers anything but 201. A refusal is
    logged at ERROR with the status code, never the response body.
  - Both use `httpx.Client(timeout=FETCH_TIMEOUT_S)` as `app/scrum/pr_links.py` does, with
    `Authorization: Bearer <GITHUB_TOKEN>`, `Accept: application/vnd.github+json`,
    `X-GitHub-Api-Version: 2022-11-28` and a `User-Agent`. The repository comes from
    `settings.GITHUB_ISSUES_REPO`, default `grepthink2/grepthink2.0`.
- `url.py`: `APIRouter(prefix="/api/issues", tags=["issues"])` with `router.post("")`,
  registered in `app/main.py`.
- `config.py`: `GITHUB_ISSUES_REPO`, and the `GITHUB_TOKEN` comment says the token also files
  issues (Issues: write on the repo). The name ends in `TOKEN`, so Sentry scrubs its value.

The issue:

```
<description, as typed>

---
Reported by [<github_user>](https://github.com/<github_user>) through the website's issue form.
```

The reporter is a link, not an `@`-mention, so nobody can make GitHub notify a stranger. The
title is the Title field, trimmed. Labels are `from-web` and `needs-triage`, created once in the
repository by hand (GitHub silently drops labels a token may not set). The email address is never
part of the issue.

The email to the maintainer: to `CONTACT_RECIPIENT`, subject `Issue report from <github_user>:
<title>`, with ` (#123)` appended when filed; Reply-To the reporter's email; the body lists the
GitHub user, the email, the issue URL or "Not filed on GitHub", then the description. HTML is
escaped the way Contact escapes it.

## Frontend

- `features/landing/ContactPage.tsx` becomes the two-card layout: `Header`, a `main` holding
  `.contact-page__cards` with `<ContactCard />` and `<IssueCard />`, `Footer`.
- `features/landing/components/ContactCard.tsx`: the existing form, moved without changes.
- `features/landing/components/IssueCard.tsx`: the new form. Its states are `idle`, `sending`,
  `filed` (with the URL), `emailed`, `rejected` (with the server's `detail`) and `error`. It posts
  with `fetch`, as Contact does; both cards import `API_BASE_URL` from a new
  `features/landing/apiBase.ts` instead of each defining it.
- `features/landing/ContactPage.scss`: `&__cards` is a grid,
  `repeat(auto-fit, minmax(min(100%, 440px), 1fr))`, gap `$spacing-lg`, max width 1160px; the
  card's own max width goes. New rules for the Write / Preview toggle, the preview box and the
  hint, built from the existing `$` tokens so `lint:design` stays clean.
- `components/Markdown/MarkdownText.scss`: the `.gt-md` rules move here from
  `features/scrum/scrum.scss`, unchanged, and `MarkdownText.tsx` imports the file. The landing
  page never loads the scrum bundle, so the preview needs its styles from the component itself.
  The scrum file's delta note records the move.
- `frontend/public/.well-known/grepthink-actions.json`: a `submit_issue` entry, role `public`,
  `POST /api/issues`, rate limit 5/min, the five parameters.
- `AGENTS.md`: `/api/issues` in the API surface, `submit_issue` in the rate-limit list.
- `.env.example` and DEPLOY.md: the `GITHUB_TOKEN` description covers the write permission.

## Failure handling

| Situation | Result |
|---|---|
| Honeypot filled | 200 with nulls, nothing sent, INFO log |
| Bad username, non-school email, unknown GitHub user | 400 with the fixed `detail`; nothing sent |
| GitHub user lookup fails for any other reason | check skipped; the report continues |
| `GITHUB_TOKEN` unset, GitHub down, or the token lacks Issues access (403) | not filed; email sent; 200 with nulls; the page says the report reached us by email |
| Issue filed, email fails | 200 with the link; ERROR log, so Sentry records it; the issue footer still names the reporter |
| Issue not filed and email fails | 502 "Failed to send your report" |

## Tests

Backend (`backend/tests/test_issues.py`), with `github.lookup_user`, `github.create_issue` and
`send_email` replaced by fakes:

- the happy path asserts the issue title, body (description, footer with the link, no email
  address anywhere), labels, the response, and the email's recipient, Reply-To and subject;
- the honeypot sends nothing and answers nulls;
- a bad username shape answers 400 without calling GitHub;
- a non-school email answers 400 without calling GitHub;
- an unknown user answers 400 and files nothing;
- a lookup that cannot be made (None) does not block the report;
- no token or a GitHub refusal still emails and answers nulls;
- an email failure after filing answers 200 with the link;
- both failing answers 502;
- the route is registered under `/api/issues` and rate-limited.

Frontend (`features/landing/__tests__/IssueCard.test.tsx` and an update to the contact page
test): the card renders its fields; Preview renders `**bold**` as bold; submit posts the expected
JSON with the `@` stripped; the filed, emailed, rejected and error states each show their text;
`/contact` renders both cards.

Gates before the PR: backend ruff and pytest; frontend lint, `lint:design`, build and vitest.

## Setup the maintainer does

1. Re-issue `GITHUB_TOKEN` from the `grepthink2` account as described under Decisions, and
   replace it in the Vercel backend project (Production). The backend reads it at start, so it
   takes effect on the next deploy.
2. Create the labels once: `from-web` and `needs-triage`.

## Out of scope

Storing reports in the database, an admin page, duplicate detection, attachments, a GFM preview,
and how the rate limiter identifies callers behind Vercel's proxy (shared with Contact, tracked in
#192).
