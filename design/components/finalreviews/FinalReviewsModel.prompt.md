Pure model for the final-review slot sign-up (C2). No UI. Ports to `features/finalReviews/finalReviewsModel.ts`.

```js
const ctx = { lens: 'po', now, signupsOpen: data.signups_open, myTeam: data.my_team, viewerId, teamsById: {}, zoomUrl: null };
const v = slotView(slot, ctx);            // badges, people, actions, menu, note (the reason shown as text)
groupSlots(data.slots, { zone, now });    // days in the viewer's zone
teamReviewState({ myTeam, slots, signupsOpen, now });   // 'book' | 'wait_po' | 'no_po' | 'closed' | 'booked' | …
whenText(slot.starts_at, { zone, schoolZone });         // "Tue, Dec 8 · 4:30 AM (Mon 3:00 PM PT on campus)"
postingDraft(entries, { existing: data.slots, now, zone, schoolZone });  // posted / overlaps / past + the API payload
errorCopy('book', { status: 409, detail: 'That slot was just taken.' }, { keeps: 'Mon, Dec 7 · 9:00 AM' });
```

- **Lenses** `instructor · ta · po · member · no_team · preview`. The preview (instructor viewing as student) reads the instructor's payload; the student lenses ignore `unbooked_teams` and `review_zoom_url`.
- **Rules it encodes** (brief §2): a Product Owner books / moves (to a free slot that has not started) / releases only while sign-ups are open and before the team's review time; a TA signs up only while sign-ups are open, the team holds a slot and they are not its Home TA; a Review TA steps down any time; the instructor does anything at any time (a started slot can take a team, which records a review held outside the app). A move or a release drops the Review TA — the copy says so. The Home TA scores the team but doesn't sit in the review: only the Review TA counts in "Teams I review", the TA header and Join Zoom (maintainer, 2026-10-20). A TA's sign-up carries the slot the TA saw; a 409 because the team moved since reads "Your sign-up for … didn’t go through: the team moved to … Sign up again at the new time?" (`errorCopy('sign_up', …, { team, when })`).
- **Times**: everything in the viewer's zone; `fmtSlotWhen().campus` is set when the zones' UTC offsets differ at that instant ("9:00 AM PT", "Mon 3:00 PM PT" when the campus day differs). Posting times are typed on the campus clock; `offsetIso` sends "2026-12-07T09:00-08:00" (offset, no seconds — the API's form).
- **Copy**: `teamReviewCopy`, `successCopy` (polite toasts), `errorCopy` (each ApiError status + detail → a sentence that says what the board did). `FR_REASONS` are the visible reasons beside an unavailable action.
