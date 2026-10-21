The board's summary bar, above the zone note and the board.

```jsx
<FinalReviewsHeader lens={lens} signupsOpen={data.signups_open} counts={boardCounts(data, teamsById)} myReviewCount={schedule?.my_review_count}
  zoomUrl={data.review_zoom_url} busy={busy} onPostSlots={openPosting} onToggleSignups={(open) => (open ? setWindow(true) : confirmClose())} onSaveZoom={saveZoom} />
```
- **Every lens**: `<Badge status="signups.open">` (green) or `signups.closed` (grey) — or "Class complete" — and the counts "12 slots · 7 booked · 5 free"; staff add "3 teams without a slot · 3 booked teams without a Review TA".
- **TA**: "You’re the Review TA for 1 team" (info text, `my_review_count` — Review TA teams only). **Staff**: the shared Zoom room (ZoomRoomField).
- **Instructor**: **Post slots** (primary while nothing is posted) and **Open sign-ups** (primary once slots exist) / **Close sign-ups** (secondary; the page confirms). Under them, what the switch does, said where it's flipped: open → "Product Owners can book, move and release; TAs can sign up to review. You can change anything at any time."; closed → "Product Owners can’t book, move or release, and TAs can’t sign up. Review TAs can still step down, and you can still change anything."; open with no slots → "…nobody can book until you post some."
- **ZoomRoomField**: label + link (or "Not set yet. Every review uses one shared room."); the instructor's ghost **Set Zoom room** / **Edit** opens an inline `Input type="url"` + **Save** / **Cancel** / **Clear room**; Esc cancels; "Enter the full link, like https://ucsc.zoom.us/j/…".
