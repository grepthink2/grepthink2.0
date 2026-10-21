"Your team's review" — the student's own booking. Page variant above the board; card variant inside the project page's "Final review" card (aside, after Sprint progress, before Team meetings; own members only, once the class has slots or sign-ups are open — `showTeamReviewCard`).

```jsx
<TeamReview myTeam={data.my_team} slots={data.slots} signupsOpen={data.signups_open} now={now} zone={zone} schoolZone={campus}
  onChooseSlot={() => setFilter('free')} onChangeSlot={() => setFilter('free')} onRelease={confirmRelease} />
<TeamReview variant="card" boardHref="/app/final-reviews?show=free" … />
```
States (`teamReviewState`) and copy (`teamReviewCopy`):
- **book** (Product Owner, sign-ups open) — "Book your team’s final review" · "Pick one of the 5 free slots below. You can change it until sign-ups close." · primary **Choose a slot**.
- **wait_po** — "Your Product Owner, Jordan Lee, books your team’s slot." · **no_po** — "Only a Product Owner can book your team’s final review. Ask your instructor to make someone Product Owner." · **closed** (before opening and after closing alike) — "Sign-ups aren’t open, so your team can’t book right now. Your instructor can still give your team a time." · **full** — "There are no free slots left. Ask your instructor for a time." · **no_slots** · **no_team**.
- **booked / booked_closed** — purple kind tile (`--gt-sched-review-soft/-text`, ClipboardCheck), "Monday, Dec 7 · 9:00 – 10:00 AM · 1 h" + campus line, countdown within 7 days ("in 3 days", "tomorrow", "today"), **Your team presents to** the Review TA ("Luis Ortega · Review TA", or "No Review TA has signed up yet.") — the Home TA isn't named: they score the team but aren't in the review — the shared Zoom room (or "Your instructor hasn’t set the Zoom room yet."); the Product Owner gets **Change slot** + **Release** while allowed, otherwise the reason with a lock glyph ("Sign-ups are closed, so your slot can’t change. Ask your instructor for any change.").
- **joinable / live** — primary **Join Zoom** from 10 minutes before the start; `live` pill from the start. **past** — "Your team was reviewed on Monday, Dec 7."
- Never shows another team's reviewers or any Zoom link outside the student's own booked team.
