# Prompt for Claude Design — What's new (release notes), 2026-10-22

Run this round once the companion spec (`docs/superpowers/specs/2026-10-22-whats-new-design.md`) is approved.
Attach `README.md` from this folder and, if you can, a screenshot of the What's new in the Claude Code desktop app.
Then send the text below to the "GrepThink Design System" project.

---

Design GrepThink's What's new: the release notes panel, the landing header's "What's new" tab, and the app's
profile menu rebuilt on the kit's Menu. The attached `README.md` (2026-10-22) is the brief:

- §2's decisions are binding.
- §3's rules decide acceptance: the kit only, tokens only, and the accessibility rules.
- §5 describes the screens, §6 the keyboard, §7 the states, and §8 the data the panel receives, with sample notes.
- §9 lists the kit additions we expect, §10 the files the codebase will touch, §11 what to deliver, and §12 the
  questions to answer in `NOTES.md`.

The reference for the look is the What's new in the Claude Code desktop app: entries marked by their date, with no
timeline rail. The checkout you can read may be older than the brief; where they disagree, follow the brief and
note the disagreement in `NOTES.md`.

## Deliver

1. The feature family `components/releases/`: `WhatsNewPanel` and `ReleaseEntry` (`.jsx` + `.d.ts` + `.prompt.md`),
   one CSS file, a `releases.card.html` gallery of every panel state, and a sample-data module built from the
   brief's sample notes.
2. The landing tab in `components/marketing/LandingHeader`, with its states in `marketing.card.html`.
3. The profile menu as a composition of the kit, with its gallery states.
4. The kit additions from brief §9, each in its kit group with its gallery states.
5. `ui_kits/grepthink/whats-new.html`, with the demo bar from brief §11.5.
6. `design_handoff_whats_new/README.md` and `NOTES.md`.
7. The `PORTING.md` row, the `readme.md` lines and `_ds_manifest.json`, as in earlier rounds. Leave
   `components/figma-reference/` untouched.

## Acceptance

- Built from the kit: no kit block re-declared or copied into feature CSS, and no hand-built button, menu, dialog,
  badge or tag. Anything new is a kit addition first.
- Each entry is headed by its date, with its version beside it. No timeline rail, dots or connecting line.
- The groups always read New, Improved, Fixed, and a missing group leaves no gap.
- The "new" dot cannot be mistaken for the red unread badge.
- The landing header fits at 320px with no horizontal scroll, in both the bar and the pill.
- Every state in brief §7 appears in the galleries, at desktop and phone width.
- No raw hex in any CSS; new tokens go in `tokens/*.css`. Light mode only.
- WCAG 2.1 AA, keyboard operation as in brief §6, touch targets of at least 44px on phones, reduced motion honoured.
