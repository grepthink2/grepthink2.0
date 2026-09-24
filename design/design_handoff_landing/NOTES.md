# Landing update (2026-09-24) — Claude Design return notes

Deliverables for `docs/superpowers/handoffs/2026-09-24-landing-claude-design/`, and where each goes.

## Files to copy

| Deliverable | Files | Repo destination |
|---|---|---|
| 1 · Product screenshot | `assets/landing/landing-preview.png` (1512×797, 215 KB) · `landing-preview.webp` (71 KB) · `landing-preview@2x.png` · `landing-preview@2x.webp` (3024w, 153 KB) | `frontend/src/assets/landing/` |
| 2 · Assistant identity + components | `components/assistant/*` (AssistantIcon/Mark, AssistantSuggestionCard, StalledFlag, ReportCheckCard, UnlinkedPRChip, `assistant.css`, card) | `design/components/assistant/` → port to `frontend/src/features/app/components/Assistant/` |
| 3 · Social share image | `assets/landing/og-image.png` (1200×630, ~224 KB) · `og-image@2x.png` (2400×1260) | `frontend/public/og-image.png` |
| 4 · Marketing guidelines | `guidelines/marketing-*.html` (8 cards) · `tokens/marketing.css` (`--gt-mkt-*`) · `components/marketing/marketing.css` | `design/` mirror; mirror tokens into `_landing-tokens.scss` as `$mkt-*` |
| 5 · Confirmations | `AnnouncementPill`, `Eyebrow` (+badge), `TypingIndicator` (`components/domain/`), `AVATAR_COLORS` (`components/display/Avatar.jsx`) | as above |
| Reference | `ui_kits/grepthink-landing/` — full page, stages, moments, contact | not shipped; the codebase keeps its own `Spotlight.tsx` etc. |

## Decisions that change the approved mockups

- **Avatar palette (everywhere).** `AVATAR_COLORS` is now `#018156 · #1B57D6 · #8A5200 · #7D3C98 · #016547 · #1543A8` — all ≥ 4.5:1 with white initials. The landing's separate set (`#d9822b`, `#9b51e0`) is gone; the hero cards, the inbox's TA/Instructor square avatars (`#2771FF` → `#1B57D6`, `#B26A00` → `#8A5200`) and the OG card use the same list. Channel *pills* keep their soft pairs unchanged.
- **PREVIEW tag text** raised from `#9aa0a6` to `#616161` (`--gt-mkt-preview-tag`) — the stage is decorative, but the tag was under 3:1 on `#fbfbfc`. Dashed border `#c3c9cf` unchanged.
- **Assistant mark:** the filled sparkle becomes a 2px-stroke spark (`AssistantIcon`, Lucide idiom). `AIDraftButton` should adopt it so there is one mark (`variant="merge"` is the documented runner-up; not exported as a separate component).
- **Assistant surfaces, in-app:** dashed `rgba(1,129,86,.35)` hairline instead of the solid `#DADADA` border, plus the mark tile and a green-700 "Project assistant" label — how an assistant card differs from a person's without a new hue. Landing size keeps the plain floating shell as mocked.
- **`UnlinkedPRChip`** gained `surface="bare"` so it can sit inside a `StageCard` pill without doubling shadows.
- **Suggestion card, dismissed state** (not mocked): muted line "Suggestion dismissed" + Undo.
- **Hero eyebrow contrast:** `--gt-mkt-eyebrow-text #016547` replaces `#018156` on the green tint (6.3:1 vs ~4.3:1). Applies to the hero eyebrow when the announcement is off.
- **Solutions preview content:** the screenshot shows the Sprint 3 board with an in-app `AssistantSuggestionCard` in the right rail (PR #43 → GT-13). If the assistant must not appear before it ships, re-snapshot `ui_kits/grepthink-landing/preview-frame.html` with that panel removed.

## Not delivered / caveats

- **AVIF** files: the export environment cannot encode AVIF. Generate from the PNGs in the repo
  (`npx sharp-cli -f avif -q 55 landing-preview.png`, or Squoosh); WebP 1× (71 KB) and 2× (153 KB) are ready.
- `landing-preview@2x.png` is 532 KB — the PNG fallback that ships should be the 1× (215 KB).
- The OG headline copy is "Scrum boards and team channels" / "Sprints, tasks and PRs on one board. Team chat built in." (the mocked longer sub-line overflowed the 60px safe margin at 44px). Adjust in `og-image.html` and re-snapshot if wording changes.
- Stage moments in the kit are CSS keyframes on `.is-playing` (fill-mode forwards); the codebase's `useInView` + `landing.config.ts` architecture from the spec is mirrored but not implemented in TS here.
