# Handoff: align the design system's names with the codebase (the "named after nothing in the kit" check)

**For:** Claude Code in grepthink2/grepthink2.0 · **From:** the design project, 2026-10-21 · **Size:** small — an audit, one lint check, a report. No component renames on either side unless the audit finds a real mismatch.

## 1. What the warning is
The design tool's check compares every export in `design/_ds_manifest.json` with the component sets of the Figma file the design project was started from ("Grepthink (Copy).fig"). That file is a generic UI-kit library: Arrow, Grid, Icons, Monitor, Navigation, Scrollbar, Thumb, Calendar, Month, Favorite, Toggle-Switch, Button content area, Date, two 3D-avatar sets. The design system is named after **the codebase** (readme: the codebase is the source of truth for names), so 183 of 185 exports match nothing in that file and the check flags them. The design project deleted its copies of the Figma components on 2026-10-20 (nothing used them); the check still holds the file's list.

**Decision (unchanged): the codebase's names win.** Don't rename anything to Figma names. Only the Figma file can make the check pass (§4); the codebase side just keeps the names in step.

## 2. What "aligned" means
Every design export has a codebase home under the same name, as `design/PORTING.md`'s component map says:
- **Kit components** (`design/components/{primitives,display,feedback,navigation}/<Name>`) ↔ `frontend/src/components/<Name>/<Name>.tsx`, same name, same `.gt-*` block.
- **Feature layers** (`analytics`, `search`, `schedule`, `scrum`, `assistant`, `marketing`, `finalreviews`, `domain`) ↔ their feature folders under `frontend/src/features/**`, the component file named like the export (`SlotBoard` ↔ `SlotBoard.tsx`).
- **Constants and models** (`RANGE_PRESETS`, `BREAKDOWN_COLUMNS`, `BADGE_STATUS`, `SCHEDULE_KINDS`, `FinalReviewsModel`…): the check counts every capitalized export as a component. In the codebase they live in model / constant files (`badgeStatus.ts`, `scheduleModel.ts`, `finalReviewsModel.ts`); same identifier, any file.
- **Not ported, by design:** galleries (`*.card.html`), `components/gallery.css`, templates (`design/templates/**`), the kit screens (`design/ui_kits/**`), Pagination (PORTING: no screen uses it).

## 3. Tasks
1. **Audit.** For each export in `design/_ds_manifest.json` (`components[].name`, `sourcePath`), find its codebase counterpart by the rules in §2. Classify: **same name** · **different name** (e.g. a codebase `Field` for the design's `FieldShell`) · **not ported yet** (planned — say which round) · **design-only** (galleries, kit chrome).
2. **Add a third `lint:design` check** — `frontend/scripts/names.mjs`, run from `design-adherence.mjs` beside the raw-hex and ownership checks. It reads the manifest and fails when a ported kit component's folder or file name differs from its design export (`src/components/<Name>/<Name>.tsx`). Feature layers and constants: report only (warning), since feature files may group several exports. Put deliberate differences in a `NAMES_ALLOWLIST` with a reason, like `OWNERSHIP_ALLOWLIST`.
3. **Report back** in `docs/superpowers/handoffs/<date>-naming-alignment/REPORT.md`, outside `design/` (the folder is replaced on every design export): the table from task 1, every "different name" with the name the codebase keeps, and the allowlist. The next design round renames the design side to match: the codebase name wins.
4. **Don't** rename codebase components to Figma names, edit `design/` by hand, or add the Figma families as code.

## 4. Making the check pass (maintainer, not Claude Code)
The check reads the Figma library, not the repo. It goes quiet only when that library's component sets carry the codebase names: publish a library from the design system's components and point the design project at it, or rename the old file's sets. Until then it repeats every run; `design/design_handoff_landing/CHECKER_NOTE.md` says so for future readers.

## 5. Already known
- `FieldShell` (design) vs the brief's "Field": PORTING maps it to `components/FieldShell/`; confirm what the code uses.
- The status map file is `components/Badge/badgeStatus.ts` (maintainer, 2026-10-20).
- 2026-10-21: the two old starting-point screens moved into `design/templates/` (`grepthink-app`, `scrum-board`). Templates stay out of `_ds_bundle.js`, which also stops `App.jsx` rendering into every page that loads the bundle (the source of the "React.createElement: type is invalid" console warnings).
