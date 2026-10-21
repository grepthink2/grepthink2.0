repo: grepthink2/grepthink2.0
branch: main
path: design

## Last sync
date: 2026-10-21T03:56:56Z
source: the maintainer's answers to the C2 NOTES §6, plus reference copies from `beta`

### Updated in this project
- The Home TA isn't in the review: "Teams I review" and the TA header count Review TA teams only; Your team's review names the Review TA the team presents to; no Join Zoom for the Home TA
- A TA's sign-up carries the slot the TA saw and is refused (409) when the team moved — `errorCopy` names the new time and offers to sign up again
- NOTES §6 answers recorded (first Product Owner only, Undo re-posts, 60-minute pre-slots reviews, `badgeStatus.ts`)
- Reference copies refreshed from `beta`: `Layout/Sidebar.scss`, `Layout/Header.scss`, `index.css`, `features/scrum/scrum.scss`, `Classes/CreateClassModal.scss`

## Screen map
| Screen | Built from (repo) |
| --- | --- |
| `ui_kits/grepthink/final-reviews.html` (board, header, teams without a slot) | `frontend/src/features/app/pages/FinalReviews.tsx` (+ `.scss`), `finalReviewsGrouping.ts`, `lib/api/tas.ts` + `types.ts` (review slots), `config/sidebar.ts` |
| `components/finalreviews/ReviewWorkspaceHeader` | `frontend/src/features/app/pages/FinalReviewDetail.tsx` (topbar + meta), `finalReviewTemplate.ts` |
| `components/finalreviews/TeamReview` (project card) | `frontend/src/features/app/components/Project/ProjectView.tsx` (aside) |
| `components/finalreviews/FinalReviewsModel` | `features/schedule/scheduleModel.ts`, `features/app/components/TeamMeetings/teamMeetingsModel.ts` (zone helpers), `backend/app/tas/review_slots.py` (rules) |
| `ui_kits/grepthink/team-meetings.html` | `frontend/src/features/app/components/TeamMeetings/*`, `EditProject/EditProjectModal.tsx` |
| `components/primitives/slider.card.html` | `frontend/src/features/app/components/TSRS/ContributionsTab.tsx` (+ `.scss`) |
| `components/search/search.card.html` (dialog stack) | design `components/search/CommandPalette.jsx` (search area not ported yet) |
| `templates/grepthink-app/app.html` (Dashboard, Roster) | `features/app/components/Dashboard/DashboardMetricCard.tsx`, `Roster/RosterList.tsx` |
| `components/analytics/*` (range filter) | `frontend/src/features/analytics/components/AnalyticsFilterRow.tsx` |
| `components/display/Tooltip.jsx`, `components/primitives/{IconButton,Button}.jsx` | `frontend/src/components/Tooltip/useTooltipDismiss.ts`, `IconButton/IconButton.tsx`, `Button/Button.tsx` (PR #259) |
| `keyframes.css`, `frontend/src/styles/*` | `frontend/src/styles/keyframes.css`, `_motion.scss`, `_skeleton.scss` |
| `assets/grepthink-logo.svg`, `frontend/src/assets/grepthink l logo.svg` | the handoff's `grepthink-logo.svg`, `frontend/src/assets/grepthink l logo.svg` (colours as `fill` attributes) |

## Sync history
### 2026-10-20T23:42:41Z
source: PR #259 (`refs/pull/259/head`) — the codebase's button kit, folded back

- Tooltip `useTooltipDismiss(enabled)`: window capture-phase Esc, press / Enter / Space hides, keyboard-focus rule (from `components/Tooltip/useTooltipDismiss.ts`)
- IconButton keeps its tooltip wrapper while disabled; Button never natively disabled while busy, aria after `{...rest}`, hidden face `aria-hidden`, link tab order; `never` aria types
- Reference copies refreshed: `frontend/src/styles/_skeleton.scss`, `tokens/colors.css`, `tokens/spacing.css`
- Tidy: `screenshots/` deleted, CHECKER_NOTE no longer points at `components/figma-reference/`, SlotBoard's "Past days (n)" is the kit Button

### 2026-10-20T23:12:09Z
source: PR #258 (`docs/c2-final-review-signup-brief`) — the C2 final-review slot sign-up brief, read as updated by the maintainer mid-round
- New `components/finalreviews/` family: the `/app/final-reviews` board for every lens, Your team's review (page + project card), posting slots, the instructor's dialogs, the scoring workspace header
- Seven Badge status keys (`signups.*`, `slot.*`, `review.no_review_ta`, `review.no_product_owner`) — the round's only kit addition
- `ui_kits/grepthink/final-reviews.html` with every §6 state; handoff in `design_handoff_final_review_signup/` (README + NOTES, brief copy in `uploads/2026-10-20-final-review-signup/`)
- Call 15 as confirmed: slots never overlap — the posting form refuses overlapping starts

### 2026-10-20T07:12:34Z
- Follow-up round from PR #257 (`docs/design-followup-2026-10-20`): logo colours restored, shared keyframes, Toast / Skeleton / Popover keyframe names
- The port's answers recorded (NOTES §6); Tooltip Esc, palette in the dialog stack, single-choice FilterChipGroups, StatCard info
- Team meetings kit screen rebuilt from the shared Modal, Tabs, fields, Button, Alert and InlineConfirm
- New `primitives/Slider` for the TSR contributions step
