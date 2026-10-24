# Prompt for Claude Design — design-system alignment round (2026-10-19)

Run this round before the Settings and C2 final-review sign-up rounds. Attach `README.md` from this folder, then
send the text below to the "GrepThink Design System" project.

---

Align the GrepThink Design System with what the app actually uses, before the codebase ports every basic
component into shared React components. The attached `README.md` (2026-10-19) is the brief:

- §2's decisions are made and binding.
- §3's rules decide acceptance.
- §4 lists what changes in the existing components, and §5 the new ones.
- §6 says how `PORTING.md` changes, including dropping the port ledger.
- §7 is what to deliver, and §8 the questions to answer in `NOTES.md`.

The codebase figures in the brief come from a sweep of beta at `b6fff628` on 2026-10-19. The checkout you read
may be older. Where the brief and the code you can see disagree, follow the brief and note the disagreement in
`NOTES.md`.

## Deliver

1. In `components/{primitives,display,feedback,navigation}/`, the changes in brief §4 and the new components in
   §5:
   - each as `.jsx` + `.d.ts` + `.prompt.md`;
   - CSS in the group's CSS file, with BEM `.gt-*` classes and `var(--gt-*)` tokens only;
   - every state in the group's `*.card.html` gallery: default, hover, focus, pressed, disabled, busy, error,
     empty, and phone width.
2. `design_handoff_ui_alignment/README.md` and `NOTES.md`:
   - The README covers the overview, decisions, component specs with exact values, keyboard and screen-reader
     behaviour, tokens and files.
   - `NOTES.md` covers the decisions you made, the status map from brief §4.8, your answers to brief §8, and
     questions for the port.
3. The documentation updates:
   - `PORTING.md` rewritten per brief §6, with the port ledger removed;
   - `readme.md` Index and "Intentional additions" lines for every new component;
   - `_ds_manifest.json` updated as in earlier rounds.

   Leave `components/figma-reference/` untouched.

## Acceptance

- No raw hex in any component CSS (the codebase's `lint:design` fails on it). New tokens go in `tokens/*.css`.
- Every interactive part works by keyboard with the WAI-ARIA pattern named in its `.prompt.md`.
- Touch targets are at least 44px on phones, reduced motion is honoured, and contrast meets WCAG 2.1 AA.
- No prop shadows an HTML or ARIA attribute.
- Flat and calm, light mode only, no marketing tokens inside the app.
- No screen redesigns: the Settings and C2 rounds come next and will design with this kit.
