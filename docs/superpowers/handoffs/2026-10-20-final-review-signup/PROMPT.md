# Prompt for Claude Design — final-review slot sign-up (C2), 2026-10-20

Run this round after the alignment round (imported into the repo by PR #256) and before the Settings round.
Attach `README.md` and `sample-data.json` from this folder, then send the text below to the "GrepThink Design System"
project.

---

Design GrepThink's final-review slot sign-up screens (C2), with the kit from the alignment round. The attached
`README.md` (2026-10-20) is the brief:

- §2's decisions are binding. Calls 12–16 are the codebase's, made with the brief, and binding unless the
  maintainer changes them.
- §3's rules decide acceptance: the kit only, statuses from the kit's status map, and the time rule.
- §4 says who sees what, §5 describes the screens, §6 lists the states, §7 the actions and their errors, and §8 the
  data contract.
- §9 lists the kit additions we expect, §10 the files the codebase will touch, §11 what to deliver, and §12 the
  questions to answer in `NOTES.md`.

`sample-data.json` is one class (CSE 115A, Fall 2026, UC Santa Cruz) in the API's own shapes, with a case for every
lens and three clocks. Render the screens from it. The backend these screens call is built: design to its
behaviour, not around it. The checkout you can read may be older than the brief; where they disagree, follow the
brief and note the disagreement in `NOTES.md`.

## Deliver

1. The feature family (brief §11.1), for example `components/finalreviews/`:
   - the board, its rows, "Your team's review" (on the page and as the project-page card), the posting form, the
     instructor's slot actions, and a pure model;
   - each as `.jsx` + `.d.ts` + `.prompt.md`;
   - one CSS file with BEM `.gt-*` classes and `var(--gt-*)` tokens only;
   - a `*.card.html` gallery of every state, and a sample-data module built from `sample-data.json`.
2. Any kit addition the screens need (brief §3.1, §9), in its kit group first, with its gallery states.
3. `ui_kits/grepthink/final-reviews.html` with `FinalReviewsScreen.jsx`: the page in the app shell, the
   project-page card, the posting flow, every confirmation and the scoring workspace header. A demo bar switches the
   lens, the clock, the viewer's zone, the data, the sign-ups state and the viewport (brief §11.3).
4. `design_handoff_final_review_signup/README.md` and `NOTES.md`:
   - The README follows the earlier handoffs' shape: overview, decisions, requirements to design mapping, screens,
     component specs with exact values, interactions and keyboard, states, data contract, model, tokens, files, and
     the class names the port should keep.
   - `NOTES.md` holds the decisions you made, your answers to brief §12, the kit additions, the new status keys, the
     brief's §10 file list (confirmed, or with your changes), and questions for the port.
5. A `PORTING.md` feature-layer row for the new family, `readme.md` Index and "Intentional additions" lines, and
   `_ds_manifest.json` updated as in earlier rounds. Leave `components/figma-reference/` untouched.

## Acceptance

- Built from the kit: no kit block re-declared or copied into feature CSS, no hand-built button, field, dialog,
  alert, badge, avatar, card or tab strip. Anything new is a kit addition first.
- Nothing the codebase lacks when it builds C2: no Combobox, FileUpload, MarkdownEditor or Stepper (use Select where
  a picker is needed).
- Times in the viewer's zone, with the campus time visible beside them when the zones differ; slot times typed on
  the campus clock.
- The student lens shows no other team's reviewers, and no Zoom link outside the student's own booked team.
- Every state in brief §6 appears in the screen file, at desktop and phone width.
- No raw hex in any CSS; new tokens go in `tokens/*.css`. Light mode only, flat and calm, no marketing tokens.
- WCAG 2.1 AA, every action operable by keyboard with its kit component's pattern, touch targets of at least 44px on
  phones, reduced motion honoured.
