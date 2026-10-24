# Prompt for Claude Design — kit fold-back round (2026-10-22)

Attach these two files, then send the text below to the "GrepThink Design System" project:
- `README.md`, from this folder;
- `docs/superpowers/handoffs/2026-10-22-naming-alignment/REPORT.md`, the naming audit, sent as `REPORT.md`.

---

Run a fold-back round on the kit. The attached `README.md` (2026-10-22) is the brief. The attached `REPORT.md` is the
naming audit your `design_handoff_naming_alignment` asked for.

- **§1:** load the reference `frontend/src/index.css` in every gallery, so the galleries render like the app. Then fix
  what that shows.
- **§2:** fix the bugs in the design's CSS that the port found:
  - the button resets;
  - the calendar header;
  - the card EmptyState's height;
  - InfoPopover's inherited text styles;
  - Card's clip;
  - the phone rule in `navigation.css`;
  - the table's sort glyph and `aria-sort`;
  - and the rest §2 lists.
- **§3:** mirror the behaviour the codebase added, and list it in `PORTING.md` → Known deltas.
- **§4:** apply two decisions:
  - Live is the blue status badge (the schedule's green pill goes);
  - the renames and kept names from `REPORT.md`.

Deliver what §5 lists, as in earlier rounds, with `_ds_manifest.json` updated. No new components and no screen
redesigns. Component CSS stays free of raw hex.
