One slot on the Final Reviews board. The lens decides what it shows through `FinalReviewsModel.slotView`.

```jsx
<ul className="gt-fr-board__list">
  {day.slots.map((s) => <SlotRow key={s.id} slot={s} context={ctx} zone={zone} onAction={act} busy={busy} reviewHref={(t) => `/app/final-reviews/${t.project_id}`} />)}
</ul>
```
- **Cells** (grid areas `time team people actions`): SlotTime · team name 14/600 or `<Badge status="slot.free">` (`slot.past` once a free slot has started) + `slot.yours` / `live` · reviewers — staff: "Home TA Maya Chen · Review TA Luis Ortega" (amber `review.no_review_ta` when missing); a student's own row: only the Review TA, the one the team presents to · actions. No row says or implies the Home TA attends the review.
- **Actions by lens**: Product Owner **Book** / **Move here** (free, not started, sign-ups open, before the team's time) and **Release** (own row); TA **Sign up to review** or the reason ("You’re the Home TA", "Sign-ups are closed"), **Step down** (their own review), **Open review**, **Join Zoom** inside the window only as the team's Review TA (the Home TA scores but isn't in the review); instructor **Place a team…** + Delete (free), **Open review** + a Menu (Appoint / Change Review TA…, Move to another slot…, Release slot…) (booked). Members and students on no team: none.
- **Names**: every button's accessible name carries the slot or team ("Book Mon, Dec 7 · 11:00 AM", "Sign up to review Redwood Labs") and starts with the visible label (WCAG 2.5.3). The Menu is the kit's Popover + Menu (↑ ↓, Enter, Esc returns focus).
- **States**: own team's row `--mine` (muted fill); a live row carries `aria-current="true"`; past rows recede by colour (tertiary text), not opacity, so text keeps 4.5:1. Rows reflow on the board's width (container queries): two columns at ≤ 760 (staff), stacked with 44px buttons at ≤ 520.
