The header of `/app/final-reviews/:projectId` (staff). Only the header is designed; the scores and notes below move onto the kit as they stand.

```jsx
<ReviewWorkspaceHeader team={detail.project} viewerRole={role} startsAt={detail.project.final_review_at} homeTa={detail.home_ta}
  reviewTa={detail.review_ta} zoomUrl={detail.review_zoom_url} now={now} zone={zone} schoolZone={campus} />
```
- Ghost **All reviews** (ArrowLeft) back to the board; the team as `h1` 22/600; the role as a category Badge — "Instructor", "You’re the Home TA", "You’re the Review TA", "Read-only"; `live` pill / countdown.
- Facts (`<dl>`, auto-fit 170px): Review (SlotTime with day, duration and the campus line — or "No slot yet") · Home TA · Review TA ("No Review TA yet") — both score the team · Zoom ("Shared Zoom room" link, or "Not set yet").
- A primary **Join Zoom** sits at the right of the title row from 10 minutes before the start until the end — for the Review TA and the instructor only. The Home TA view keeps its badge and facts but has no Join: the Home TA scores the team's categories here and doesn't sit in the review.
