# Prompt for Claude Design — design-system follow-up round (2026-10-20)

Attach these six files, then send the text below to the "GrepThink Design System" project:
- `README.md` and `grepthink-logo.svg`, from this folder;
- `frontend/src/assets/grepthink l logo.svg`;
- `frontend/src/styles/keyframes.css`, `frontend/src/styles/_motion.scss` and `frontend/src/styles/_skeleton.scss`.

---

Run a short follow-up to the alignment round. The attached `README.md` (2026-10-20) is the brief.

- **§1:** restore the GrepThink logo. The last export stripped its fills, so it draws black. Restore it byte for byte
  from the attached `grepthink-logo.svg` and `grepthink l logo.svg`, and never tokenise or strip an asset's colours
  again.
- **§2:** fold back what the codebase changed:
  - the shared keyframes file (refresh the reference copies from the attached styles);
  - the Toast and skeleton keyframe names;
  - the second `lint:design` check;
  - the codebase additions.
- **§3:** record the port's answers to your `NOTES.md` questions, and make the changes they ask for: Tooltip's Esc,
  the single-choice FilterChipGroups in the kit screens, and the team-meetings kit screen.
- **§4:** add one control, `primitives/Slider`.

Deliver what §5 lists, as in earlier rounds:
- `.jsx` + `.d.ts` + `.prompt.md` and a gallery for Slider;
- `PORTING.md`, `NOTES.md` and `readme.md` updates;
- `_ds_manifest.json`.

No other new components and no screen redesigns. Component CSS stays free of raw hex; asset files keep their colours.
