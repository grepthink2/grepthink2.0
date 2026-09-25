# Landing update (2026-09-24) — Claude Design return notes

Deliverables for `docs/superpowers/handoffs/2026-09-24-landing-claude-design/`, and where each goes.

## Files to copy

| Deliverable | Files | Repo destination |
|---|---|---|
| 1 · Product screenshot | `assets/landing/landing-preview.png` (1512×797, 215 KB) · `landing-preview.webp` (1×, 77 KB — added in Round 2) · `landing-preview@2x.png` · `landing-preview@2x.webp` (3024w, 153 KB) | `frontend/src/assets/landing/` |
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

## Round 2 (2026-09-24) — fixes after PR #185 (`feat/landing-new-features`)

| # | Change | Files |
|---|---|---|
| 1 | **Share image:** copy column narrowed 660 → 600px and the headline set at 62px (was 68) so "Scrum boards and" clears the tilted card by ≥ 54px; sub-line uses `text-wrap: balance` (three even lines, no orphan). Still 1200×630, 60px safe margin, all text ≥ 44px. Re-exported 1× and 2×. | `ui_kits/grepthink-landing/og-image.html` · `assets/landing/og-image.png` · `og-image@2x.png` |
| 2 | **Missing file:** `landing-preview.webp` (1×, 1512×797, 77 KB) added — encoded from the 1× PNG at q 0.82. | `assets/landing/landing-preview.webp` |
| 3 | **One assistant mark:** `AIDraftButton` now renders `AssistantIcon` (the 2px-stroke spark; 13px md / 12px sm) instead of its own filled sparkle. Port: `import { AssistantIcon } from '../Assistant/AssistantIcon'`. | `components/scrum/AIDraftButton.jsx` · `.prompt.md` |
| 4 | **Types:** `evidence` is optional in `AssistantSuggestionCardProps` — read only in the pending state. | `components/assistant/AssistantSuggestionCard.d.ts` |
| 5a | **Phones (<768px):** one still card per band, **no moment** — the stage has no fixed height there, so a card that changes size would push the page around. Kit: `Band` never sets `play` below 768px (`usePhone()`), and Band 3's phone card stays `pending` (evidence + Approve/Dismiss), never the approved line. | `ui_kits/grepthink-landing/Landing.jsx` · `Stages.jsx` · `components/marketing/marketing.css` (comment) · `StageCard.jsx` doc · `StageCard.prompt.md` |
| 5b | **Band 3 desktop:** suggestion card `width: 288px; top: 25%` (was 296 / 112px); stalled flag and report card `right: 3%` (were 20 / 18px). | `ui_kits/grepthink-landing/Stages.jsx` |
| 5c | **Build values into tokens:** `--gt-mkt-anchor-offset` 96 → **88px** (section `scroll-margin-top`); `--gt-mkt-band-pad-y` 72px → **`clamp(72px, 9vw, 112px)`** (the phone override of 56px is dropped — the clamp resolves to 72px there); new `--gt-mkt-band-link` **#016547** (= green-700; `.gt-spotlight__link` uses it, hover is underline only); new `--gt-mkt-card-meta` **#8A8A8A** (= gray-500; `.gt-stage-card__meta` uses it — hero float-card meta keeps `#9aa0a6`). | `tokens/marketing.css` · `components/marketing/marketing.css` |
| 5d | **Guidelines & docs** updated to match: band layout card (padding, anchor offset, link color, Band 3 placement), responsive card (<768 = still card, no moment, auto-height stage, Band 3 pending), motion card (moment ≥ 768px only), card-shell card (meta color), `readme.md` VISUAL FOUNDATIONS + ICONOGRAPHY, `Spotlight.prompt.md`. | `guidelines/marketing-*.html` · `readme.md` |

Unchanged on purpose: the Solutions screenshot (`landing-preview.*`) keeps the "Draft story with AI" button and the assistant card; the announcement pill, hero, closing band, footer and contact page are untouched. The attached local checkout is on `main` (no `Spotlight.tsx` yet), so the build values above were taken from this round's brief rather than read from `frontend/src/features/landing`.
