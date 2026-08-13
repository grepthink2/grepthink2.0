# design/ — partial mirror (scrum bundle only)

This folder is the in-repo copy of the **GrepThink Design System** claude.ai project
(projectId `36e7e383-ba62-4ec7-a111-f6322c5b5b7b`), per the workflow in [PORTING.md](PORTING.md).

**As of 2026-08-12 this is a PARTIAL mirror** — only the files needed to implement the
Scrum Board feature were synced (via DesignSync, session-scoped tool):

- `PORTING.md` — the design→code porting recipe
- `design_handoff_scrum_board/README.md` — the scrum feature handoff (spec source of truth)
- `components/scrum/scrum.css` — token-exact CSS for every `.gt-*` scrum class
- `components/scrum/<Name>.{jsx,d.ts}` — the 11 scrum reference components

Not mirrored (still only in the claude.ai project): `tokens/` (repo
`frontend/src/styles/` is the source of truth per PORTING.md), `guidelines/`,
`ui_kits/`, the other component families, `*.prompt.md` usage notes,
`scrum-board.reference.html`, and `scrum.card.html`.

To complete the mirror, re-drop the full design-system zip over this folder
(replacing it wholesale), as PORTING.md describes — `git diff design/` then shows
exactly what changed on the design side.
