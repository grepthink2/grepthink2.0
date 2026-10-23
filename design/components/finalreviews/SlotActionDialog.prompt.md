The instructor's slot actions that need a choice — a Modal (md) with one native Select (optgroups; Combobox lands after C2) and the consequence said before the button.

```jsx
<SlotActionDialog open kind="move_team" team={teamsById[id]} slots={data.slots} now={now} zone={zone}
  onConfirm={({ slotId }) => api.bookReviewSlot(slotId, id)} onCancel={close} />
```
- **place_team** (from a free row): "Team" — *Without a slot* first, then *Booked — moves the team*. "Arboretum gets Mon, Dec 7 · 11:00 AM." / "Move Trailhead to … ? Its slot on … becomes free. Luis Ortega will no longer be its Review TA."
- **place_on_slot** (from Teams without a slot) and **move_team** (row Menu): "Slot" / "New slot", free slots by day, started ones marked "· started" — placing there records a review held outside the app.
- **review_ta** (row Menu, any time, slot or not): "No Review TA" + the class's TAs except the Home TA ("…’s Home TA, Maya Chen, isn’t listed."), each with its load. "Priya Nair replaces Luis Ortega as Trailhead’s Review TA." · "Fog City has no slot yet. Its first booking keeps this Review TA."
- Moving a team whose review time passed adds: "…the review may already have been held and scored. Moving clears that time and its Review TA; the scores already entered stay." The confirm turns solid danger when a Review TA is dropped or the time has passed.
- Focus starts on the Select (`data-autofocus`); Enter submits; Esc / Cancel close (blocked while busy); a refusal shows as an error Alert inside and keeps the choice.
