# Prompt for Claude Design — email templates, 2026-11-19

Attach `README.md` from this folder and, if you can, screenshots of today's invite and verification-code emails
as they arrive (Gmail on a phone is the most common reader). Then send the text below to the "GrepThink Design
System" project.

---

Redesign every email GrepThink sends as one branded family. The attached `README.md` (2026-11-19) is the brief:

- §1 says what is wrong today: hand-written HTML with no logo, no brand colour or font, a text link where the
  action should be, no preheader, and no shared frame for the reminders and digests that come next.
- §2's decisions are binding where they are not marked ⚑; argue the ⚑ ones in `NOTES.md` if you disagree.
- §3's rules decide acceptance. Email is not the web: tables and inline styles, PNG images, fonts that fall back
  to Arial, tokens written as their literal values, and a design that survives images off and forced dark mode.
- §4 lists the thirteen emails, §5 their screens and states, §6 the action each one offers and what a reader can
  do from the inbox, §7 the data each template receives.
- §8 lists the parts we expect, §9 the files the codebase will touch, §10 what to deliver, and §11 the questions
  to answer in `NOTES.md`.

Start with the shared layout and its parts (the brand band, the card, the button, the code, the facts rows, the
item row and the two footers) at 600px and at a phone's 375px. Then the invites and the code email, which most
students see first, then the rest. The checkout you can read may be older than the brief; where they disagree,
follow the brief and note the disagreement in `NOTES.md`.

## Deliver

1. The email kit in `emails/parts/`: each part with its variants, as table-based HTML with inline styles.
2. One `.html` and one `.txt` per email in brief §4 under `emails/`, with `{{ variables }}` (Supabase's own
   variables in `emails/supabase/`), and `emails/sample-data.json` with a value for every variable and the
   stress cases in brief §5.
3. `emails/emails.card.html`: every email as its inbox row (From, subject, preheader) above the opened email, at
   600px and 375px, with switches for images off and dark mode, and the plain text beside it.
4. The logo lockup's spec (asset, display size, padding, background) and, if you take the ⚑, the square inbox
   mark.
5. `design_handoff_emails/README.md` and `NOTES.md`, in the earlier handoffs' shape: overview, decisions, each
   part's exact values with the token each comes from, each email's copy (subject, preheader, body, button
   label, footer), client notes, files, and what the port keeps. `NOTES.md` holds your decisions, your answers
   to brief §11, any new token, and what each payload must gain.
6. A `PORTING.md` row, `readme.md` Index lines, and the gallery's card in `_ds_manifest.json`. Nothing in
   `components[]`, and leave `components/figma-reference/` untouched.

## Acceptance

- One layout across all thirteen emails: the same band, card, button, type and footer.
- Every value is a token's literal value, named in the spec; no colour outside `tokens/*.css`.
- Built for email: tables for layout, inline styles, no CSS variables, flexbox or grid, PNG images only. Each
  email is right with its `<style>` block stripped, with images off, in Arial, and in Gmail's and Apple Mail's
  dark modes.
- Each email has one primary action, a button with its URL printed beneath, except the code email, whose code is
  large, monospaced and easy to select.
- No link changes anything by being opened, nothing tracks the reader, and no email asks for a reply except the
  contact and issue emails.
- An email's subject and preheader together say what happened and what to do. Its body says which class or team
  it is about and, where there is one, by when, in the school's zone with the zone named.
- Every email has a written plain-text version.
- Category emails (12, 13) end with a footer that links "Turn off …" and the email settings; transactional
  emails offer no unsubscribe.
- WCAG 2.1 AA: text contrast of at least 4.5:1, links in `--gt-blue-600` and underlined, `lang` set, one `<h1>`,
  layout tables marked presentational, buttons at least 44px tall, nothing clipped at 200% text size.
- Under 100 KB of HTML per email, with the reminder and the digest capping their lists.
