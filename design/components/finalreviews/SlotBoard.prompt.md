The Final Reviews board (`/app/final-reviews`) — one component for the student, Product Owner, TA and instructor lenses.

```jsx
<SlotBoard data={slots} schedule={staff ? schedule : null} lens={lens} viewerId={me.id} now={now} zone={zone} schoolZone={campus}
  status={refetching ? 'refetching' : 'ready'} alert={conflict} onDismissAlert={clear} busy={busy}
  onAction={handle} onDayAction={handleDay} onPostSlots={openPosting} onRetry={reload} reviewHref={(t) => `/app/final-reviews/${t.project_id}`} />
```
- **Shape**: day sections of rows (not a Table — rows reflow on phones and no group-row addition is needed). Each day is a `<section aria-labelledby>` with the schedule layer's `ScheduleDayHeader` ("Today", "Monday · Dec 7", aside "2 free · 4 booked"), sticky while its rows scroll; rows are `<ul>` / SlotRow.
- **Long boards**: day jump links (`Button size="sm" variant="outline" href="#gt-fr-day-…"`, "Mon, Dec 7 · 2 free"), a single-choice `FilterChipGroup` (students: All · Free; TA: All · Teams I review (Review TA teams only; empty: "You’re not the Review TA of any booked team.") · No Review TA; instructor: All · Free · No Review TA), and fully past days folded behind "Past days (n)" (the kit's ghost sm Button with `aria-expanded`) while later days remain (all shown once every day is past).
- **Zone**: when the viewer's zone differs, the note "Times in GMT+5:30 · campus is PT" sits above the board once, and each row shows the campus time.
- **Alerts** carry actions when a refusal has a next step: a TA's sign-up refused because the team moved shows **Sign up for Tue, Dec 8 · 10:00 AM** (`alertActions`).
- **States**: loading (skeleton days, `role="status"`), refetching (frame held, `aria-busy`, `--gt-opacity-refetch`), error (quiet "Couldn’t load the final-review slots." + Try again — never a red panel), no slots (instructor: card empty state with **Post slots**; others: "Your instructor posts the times teams can book."), a class from before slots (staff: the recorded times as read-only rows with a note), a filter with no matches (quiet line).
