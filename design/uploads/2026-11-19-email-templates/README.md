# Brief — email templates (2026-11-19)

Every email GrepThink sends, redesigned as one family: the backend's own emails, the four Supabase Auth sends
for us, and the two optional emails that are about to be built (deadline reminders and unread message
digests). Decisions marked ⚑ are the brief's own and can be argued in `NOTES.md`; the others are the
maintainer's.

## 1. Why

**They don't look like GrepThink.** Each email is HTML written by hand inside a Python string:

- `font-family: sans-serif`, text in `#1a1a1a`, fine print in `#666`, a code box in `#f4f4f5`: no Poppins, no
  brand green, no logo, no header, no footer, and no value that is a token.
- Four widths: 520px (invites, document finalized), 480px (verification code), 560px with 13px text (custom
  invites) and none at all (the contact and issue emails).
- The action is a text link ("Sign in to GrepThink", "Read it on GrepThink"), never a button, and its URL is not
  printed anywhere for a client that drops links.
- No preheader, so the inbox preview shows whatever text happens to come first.

**They leave out context.** An invite names the class but not the term or the school. "Team X finalized its
Sprint 2 Report" names neither the class nor who finalized it. No email says why its reader got it.

**There is no frame to add to.** Deadline reminders and message digests come next: their switches are already in
Settings → Email, marked "coming soon". Today each would be one more hand-written variant. The outbox already
gives a category email an unsubscribe link for its footer and a one-click `List-Unsubscribe` header, but no
template has a footer to put the link in.

**Supabase's emails live apart.** Sign-up confirmation, password reset and the two email-change messages are sent
by Supabase Auth from templates set in each project's dashboard (DEV and PROD). They share nothing with the
backend's emails and are not in the repo.

## 2. Decisions

1. **One family.** Every email shares one layout: the brand at the top, the message on a white card over the
   app's grey canvas, and a footer that says why the reader got it.
2. **Brand from the tokens.** Poppins with the fallback stack in §3, the green ramp for the brand and the primary
   action, the grey ramp for text, Fira Code for codes. Light, flat and calm, as in the app; ⚑ no marketing
   gradients or `--gt-mkt-*` tokens.
3. ⚑ **A green band.** The brand sits on a band of `--gt-green-500` with the logo in white, the treatment
   `guidelines/brand-logo.html` shows on green. A solid band keeps the logo legible when a client forces dark
   mode. Argue for the green logo on white if you prefer it.
4. **Context before the fold**, in this order: what happened; what it is about (class, team, person); what to do;
   by when. The inbox row (subject plus preheader, about 90 characters) says the same on its own.
5. **One primary action per email**, a button, with its URL printed under it. Further actions are text links.
   The verification code is the one email without a button: its action is the code.
6. **From the inbox** a reader can open the right page of the app (a deep link), copy a code, reply where a
   person is on the other end (the contact and issue emails, whose Reply-To is the person who wrote), and turn
   off a category of email (the one-click `List-Unsubscribe` header the outbox already sends, and the footer's
   link to `/unsubscribe`).
7. **Opening a link changes nothing.** Mail scanners and link previews open links before people do. Every change
   (accepting an invite, approving a join request, unsubscribing) lands on a page with a button, as
   `/unsubscribe` already does. No button acts straight from the email. ⚑ No Gmail schema.org actions: Gmail
   shows them only for senders Google has registered.
8. **No tracking.** No pixels, no redirect-wrapped links, no tracking parameters. Maileroo's open and click
   tracking is off on purpose.
9. **Written plain text.** Every email has a text version with the same content in the same order and each URL
   on a line of its own.
10. **Instructors' words stay theirs.** A custom invite's body is framed by the layout, not restyled.
11. **Supabase's four emails join the family**, delivered as HTML with Supabase's template variables for the
    maintainer to paste into each dashboard. ⚑ The port also commits them, so they stop living only in two
    dashboards.
12. **Design the two emails that are not built yet** (§4, 12 and 13): they will be the most frequent ones we
    send, and their switches already exist.

## 3. Rules

Email clients render a small, old subset of HTML and CSS. Our readers use Gmail (web, iOS and Android; UCSC
addresses are Google Workspace accounts, so this is most of them), Apple Mail (macOS and iOS) and Outlook (web,
the new Windows app, and classic Outlook for Windows, which renders with Word). Every email must hold up in all
of them.

- **Structure.** Tables for layout (`role="presentation"`), one column, 600px wide at most and fluid below it,
  16px gutters on a phone. No flexbox, grid, `position`, floats for layout, `calc()`, CSS variables, background
  images, forms, scripts, video or iframes.
- **Inline styles.** Every element carries its own `style`. A `<style>` block may add phone and dark-mode
  refinements only: Gmail and others drop it, so the email must be right without it.
- **Tokens as literals.** Emails cannot read `var(--gt-*)`. Each colour, size and spacing value is the literal
  value of a token in `tokens/*.css`, and the spec tables name the token beside it. This replaces the "no raw
  hex" rule for email files only. A value the tokens lack is a new token first.
- **Fonts.** Poppins loads only where a client allows web fonts (Apple Mail, iOS Mail); Gmail and Outlook show
  the fallback. Sans: `Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
  sans-serif`. Mono: `'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace`.
  Classic Outlook needs Arial named outright. Most readers will see Arial or Roboto, so the design must look
  right in them.
- **Type.** ⚑ Body at `--gt-text-body-lg` (16px: these are read on phones), line height `--gt-leading-normal`,
  headings at `--gt-text-h2` or `--gt-text-h3`, fine print at `--gt-text-body` (14px), nothing below
  `--gt-text-caption` (12px). Weights 400 and 600 only.
- **Colour.** Text in `--gt-text-primary`, `--gt-text-secondary` or `--gt-text-tertiary`; never `--gt-gray-500`
  for text (3.45:1 on white). ⚑ Links in `--gt-blue-600` and underlined: `--gt-text-link` (`--gt-blue-500`) is
  4.29:1 on white, under AA for body text. White on `--gt-green-500` is 4.91:1, enough for a button label.
- **Images.** PNG, never SVG (Gmail and Outlook don't show it), served over HTTPS from the app's canonical host
  (`https://www.grepthink2.com/email/…`, so no redirect sits in front of an image), with `width`, `height` and
  `alt`, exported at 2× and shown at 1×. Classic Outlook and some university mail block images until the reader
  allows them, so every email must make sense with images off: no text inside images, and the logo's alt text is
  "GrepThink".
- **The logo.** Use the repo's logo (`assets/grepthink-logo.svg`: the mascot and wordmark, 1920 × 540). PORTING.md
  explains that this tool rewrites an SVG when it saves one, so specify the lockup (which asset, display size,
  padding, background) and the port exports the PNGs from the repo's own SVG.
- **Buttons.** Bulletproof: a table cell with the background colour and padding, the link filling it, at least
  44px tall, the label in real text. ⚑ Full width on a phone. Classic Outlook may need VML for rounded corners;
  square corners there are acceptable.
- **Dark mode.** Clients force it: Gmail's apps invert colours, Apple Mail honours `prefers-color-scheme`, Outlook
  inverts in part. Design light, then show how each email survives each of those. No dark text on a transparent
  image, no light-grey text that inverts to nothing, and ⚑ a dark variant for Apple Mail behind
  `color-scheme: light dark`.
- **Accessibility.** `lang="en"`, a `<title>` equal to the subject, one `<h1>`, reading order equal to visual
  order, contrast of at least 4.5:1 for text (3:1 at 24px, or 18.66px bold), links named by what they open
  ("Open TSR 3", never "click here"), no meaning carried by colour alone, and nothing clipped at 200% text size.
- **Length.** Under 100 KB of HTML. Gmail clips a longer message, and the footer's unsubscribe link goes with
  the clipped part. Lists cap (§5).
- **Long values.** Every variable is text a person typed (class, team, document and assignment titles, names,
  message previews), and the port escapes it. Design for 60-character class names, 100-character titles and
  long unbroken strings such as URLs: they wrap and never widen the frame.
- **Times.** An email cannot know its reader's time zone. Write deadlines in the school's zone and name it
  ("Thursday, Oct 9, 11:59 PM PT"), from `institutions.timezone`. "Tonight" or "tomorrow" only beside the date.
- **Words.** The app's vocabulary (AGENTS.md, "Vocabulary"): TSR, Product Owner, Meeting TA, Review TA. Plain
  and calm, second person. ⚑ No exclamation marks and no emoji in subjects. Subjects stay under about 60
  characters and lead with the thing ("TSR 3 closes tonight"); ⚑ the From name already says GrepThink, so the
  subject needn't.

## 4. The emails

| # | Email | Who gets it, and when | Sent by | Subject today |
| --- | --- | --- | --- | --- |
| 1 | Class invite, new to GrepThink | someone on a class roster without an account, when the instructor invites the roster (now or at a set time) | outbox `class_invite` | "Join {class} on GrepThink" |
| 2 | Class invite, has an account | a student whose account the instructor enrolled | outbox `class_invite` | "You've been added to {class} on GrepThink" |
| 3 | Custom invite | the same people, with a subject and body the instructor wrote in the invite composer, and any CC or BCC | outbox `custom_invite` | the instructor's |
| 4 | Document finalized | the team's Meeting TA and Review TAs, never the person who finalized, when a team finalizes a document | outbox `document_finalized` | "{team} finalized its {document}" |
| 5 | School email code | someone verifying a school email address; the code expires in 10 minutes | sent at once | "GrepThink — verify your school email" |
| 6 | Contact message | the maintainers, from the public Contact page; Reply-To is the person who wrote | sent at once | "New contact message from {name}" |
| 7 | Issue report | the maintainers, from the issue form, beside the GitHub issue it files; Reply-To is the reporter | sent at once | "Issue report from {login}: {title} (#{n})" |
| 8 | Confirm sign-up | anyone who signs up with a password | Supabase Auth | the dashboard's |
| 9 | Reset password | anyone who asks on Forgot password | Supabase Auth | the dashboard's |
| 10 | Change email, to the new address | someone changing their login email (Settings → Change) | Supabase Auth | the dashboard's |
| 11 | Change email, to the current address | the same person: under "Secure email change" both addresses must confirm | Supabase Auth | the dashboard's |
| 12 | Deadline reminder | a student who has not submitted a TSR, feedback form or interest form that closes soon | outbox, category `reminders` (not built) | new |
| 13 | Unread message digest | anyone with messages waiting over an hour, at most once a day | outbox, category `digests` (not built) | new |

Emails 6 and 7 go to the maintainers. ⚑ They use the layout too, plainer: labelled fields, the message, and for
7 the issue link.

## 5. Screens and states

Show each email as its inbox row (From, subject, preheader) above the opened email, at 600px and at 375px, and
show its plain-text version. Then:

- **1 and 2:** a 60-character class name; no instructor name (the text falls back to "Your instructor").
- **3:** a short message; a long one with a list, a link and both tokens (§7); a message without the sign-up
  token.
- **4:** a sprint report, a release summary and a test report; a long team name and a long title.
- **5:** the code; the code at 200% text size.
- **6 and 7:** a long message; an issue that could not be filed on GitHub.
- **8 to 11:** each one.
- **12:** one TSR closing tonight; one closing tomorrow; three items from two classes in one email (a TSR, a
  feedback form and an interest form); a TSR whose late window is open (§7). ⚑ Progress ("You've reviewed 2 of 4
  teammates") if you think it earns its place; say what data it needs.
- **13:** one conversation; five (a team channel, a direct message, a class channel, one that mentions the
  reader); more than five, capped with "and 4 more conversations".
- **Footers:** transactional (no unsubscribe) and category (unsubscribe and settings).
- **Every email** with images off, in Gmail's forced dark mode and in Apple Mail's dark mode.
- **The unsubscribe page** the footer opens (`/unsubscribe`): checking the link, confirm, done, an invalid link, a
  failure. ⚑ Restyle it only if it does not already match the emails.
- ⚑ **The inbox mark:** a square mark (the mascot on a solid background) for BIMI, which shows a sender's logo
  beside its mail in some inboxes. BIMI needs a DNS record and, for Gmail, a paid certificate: whether to set it
  up is the maintainer's call. The design only supplies the mark.

## 6. Actions

| Email | Button | Other links | From the inbox |
| --- | --- | --- | --- |
| 1 | "Create your account" → `/studentsignup` | the access code, shown as a code to type after signing up | — |
| 2 | ⚑ "Open {class}" → `/login` | ⚑ the access code, if it still helps | — |
| 3 | ⚑ the instructor's sign-up link, rendered as the button | whatever links the instructor wrote | — |
| 4 | "Read {document}" → `/app/projects/{project_id}/documents/{document_id}` | — | — |
| 5 | none: the code is the action | "Didn't ask for this? Ignore it." | copy the code |
| 6 | none | — | reply to the person who wrote |
| 7 | "Open issue #{n}" → the GitHub issue | — | reply to the reporter |
| 8 | "Confirm your email" → `{{ .ConfirmationURL }}` | — | — |
| 9 | "Choose a new password" → `{{ .ConfirmationURL }}` | "Didn't ask? Your password hasn't changed." | — |
| 10, 11 | "Confirm your new email" / "Confirm the change" → `{{ .ConfirmationURL }}` | — | — |
| 12 | "Open {assignment}" → `/app/assignments/{assignment_id}`; ⚑ "See your deadlines" when there are several | each item links to its assignment | turn off reminders (header) |
| 13 | "Open messages" → `/app/messages` | each conversation: "Reply" → `/app/messages/{conversation_id}` | turn off digests (header) |

Paths are relative to the app (`{{ app_url }}`). A category email's footer (12, 13) says why it came, links
"Turn off {category}" to `{{ unsubscribe_url }}`, and ⚑ links "Email settings". Settings is a modal today and
`/app/settings` redirects to Home: if the design needs a URL that opens Settings → Email, say so in `NOTES.md` and
the port will add it.

Replies to any other email go to the sender's noreply address, which nobody reads. Never ask for a reply; point
questions to the Contact page (`{{ app_url }}/contact`).

## 7. Data the templates receive

Write variables as `{{ name }}`; the port maps them to its own rendering. Mark a repeated block (a digest's
conversations, a reminder's items) as one block and list its fields. Supabase's templates keep Supabase's own
variables exactly as written below.

Every backend email gets `app_url` (the app's address), ⚑ `recipient_email` (for a "Sent to …" line), and a
category email gets `unsubscribe_url`.

| Email | What it carries today | What it may gain (say what you need in `NOTES.md`) |
| --- | --- | --- |
| 1, 2 | `class_name`, `course_code` (the access code), `instructor_name`, `registered` | the school, the term and year |
| 3 | `subject`, `body_text`, `body_html` (the composer's HTML), `cc`, `bcc` | `class_name`, `course_code` |
| 4 | `project_name` (the team), `document_title`, `link` | the class, the document's kind, who finalized it, when |
| 5 | the address being verified, the six-digit code | — |
| 6 | `name`, `email`, `message` | — |
| 7 | GitHub `login`, `email`, `title`, `description`, the issue's `url` and `number` (or "Not filed on GitHub") | — |
| 8–11 | `{{ .ConfirmationURL }}`, `{{ .Token }}` (six digits), `{{ .SiteURL }}`, `{{ .Email }}`, and `{{ .NewEmail }}` in 10 and 11 | — |
| 12 | ⚑ proposed: `first_name`; `items[]`, each `title`, `kind` (`tsr`, `feedback`, `interest_form`), `class_name`, `team_name` (TSRs), `due_at` (formatted in the school's zone), `when` ("tonight", "tomorrow", "in 2 days"), `late_until` (or none), `link` | progress |
| 13 | ⚑ proposed: `first_name`, `total_unread`; `conversations[]`, each `name`, `kind` (`team`, `direct`, `class`), `unread_count`, `latest_sender`, `latest_at`, `preview` (or none), `mentions_you`, `link`; `more_count` | — |

**Custom invites carry two tokens.** The composer's HTML can hold the sign-up link and the access code as spans,
`<span data-token="SIGNUP_LINK" data-value="…">` and `<span data-token="ACCESS_CODE" data-value="…">`. Today they
reach the email as plain text, and clients may or may not turn the URL into a link. Design how each one renders
(⚑ the sign-up link as the primary button where the instructor put it, the code as the code chip); the port
converts the spans.

**Late windows.** A deadline is an instant (`due_at`). An assignment may stay open after it, until
`accept_until`, for late work. A reminder says which applies: "closes tonight at 11:59 PM PT", or "was due
yesterday; late submissions close Friday at 11:59 PM PT".

## 8. Parts we expect

An email kit of its own, apart from the React kit: the layout (head, preheader, brand band, card, footer), a
button (primary and secondary), a code (a verification code; an access code), facts (label and value rows: Class,
Team, Closes), an item row (an assignment or a conversation: a leading mark, a title, a meta line, a trailing
link), a note (a calm callout, such as a late window), a divider, and the two footers. ⚑ Initials, not photos, in
the digest: some clients block photos until asked, and they are students' pictures in someone else's inbox.

## 9. Files the codebase will touch

- `backend/app/classes/invite_email.py`, `backend/app/documents/notify.py`, `backend/app/outbox/kinds.py` (custom
  invites), `backend/app/utils/email.py` (`wrap_editor_html_for_email`), `backend/app/profiles/controller.py`
  (the code), `backend/app/contact/controller.py` and `backend/app/issues/controller.py`.
- ⚑ A new backend module holding the layout and the parts, shared by all of the above and by the reminder and
  digest kinds when they are built.
- `frontend/public/email/` for the PNGs.
- ⚑ `supabase/email-templates/` for emails 8 to 11, which the maintainer pastes into Authentication → Email
  Templates on DEV and PROD.
- `frontend/src/features/auth/pages/Unsubscribe.tsx`, if the page changes.

## 10. Deliver

As earlier rounds, adapted to email. These are HTML files, not JSX:

1. `emails/` at the design root, not under `components/`: these are not React components and add nothing to
   `_ds_manifest.json`'s `components`. In it: `parts/` (each part and its variants), one `<name>.html` and one
   `<name>.txt` per email in §4 (inline styles, `{{ variables }}`), `supabase/` for emails 8 to 11, and
   `sample-data.json` with a value for every variable and the stress cases in §5.
2. `emails/emails.card.html`, a gallery of every email as its inbox row above the opened email, at 600px and
   375px, with switches for images off and for dark mode, and the plain-text version beside it.
3. The logo lockup's spec, and ⚑ the square inbox mark (§5).
4. `design_handoff_emails/README.md` and `NOTES.md`. The README follows the earlier handoffs' shape: overview,
   decisions, each part with exact values and the token each comes from, each email's copy (subject, preheader,
   body, button label, footer), client notes, files, and what the port keeps. `NOTES.md` holds your decisions,
   your answers to §11, any new token, and what each payload must gain.
5. A `PORTING.md` row (emails → the backend module), `readme.md` Index lines, and the gallery's entry in
   `_ds_manifest.json`'s `cards`. Leave `components/figma-reference/` untouched.

## 11. Questions to answer in `NOTES.md`

1. A green band with the white logo, or the green logo on white? Why, given forced dark mode?
2. Should the digest show message text, or only who wrote and how many? Text means a classmate's words on a lock
   screen.
3. Should the verification code also go in the subject line, so it can be copied from the notification? A code
   in a subject shows on a lock screen too.
4. Does the invite for a student who is already enrolled still need the access code?
5. How should a custom invite's tokens render, and should the layout add a join block when the instructor's text
   has no sign-up link?
6. What do the reminder and the digest need from the data beyond §7?
7. Which links need a page or URL that does not exist yet (Settings → Email, a class's page)?
8. Anything you would change on the unsubscribe page.
