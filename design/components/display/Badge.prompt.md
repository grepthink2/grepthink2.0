Status, category and role pills. Not interactive. A feature names **what** the thing is; the presets decide the colour.

```jsx
<Badge status="task.blocked" />                    {/* red "Blocked" */}
<Badge status="assignment.due_soon" />             {/* amber "Due soon" */}
<Badge status="pr.merged" />                       {/* purple — GitHub's convention */}
<Badge status="request.pending">Invited</Badge>    {/* preset colour, custom words */}
<Badge category="sponsored" />                     {/* outlined + Building icon */}
<Badge projectRole="product owner" />              {/* outlined + Star */}
```

- **Status colour rule** (decided): green = done or positive · blue = in progress or informational · amber = needs attention soon · red = a problem (overdue, denied, absent, dropped) · grey = not started or inactive. The full map is `BADGE_STATUS` (and the table in `design_handoff_ui_alignment/NOTES.md`). Soft fill + `-text` colour, pill radius 20, 0.8rem/500.
- **Categories are not statuses**: conversation type (TA / Instructor / Team), "Company Sponsored", "Manual", member counts → `category`: white fill, 1px `--gt-border`, radius 7, secondary text, a 12px icon. They never borrow a status colour.
- **Roles** use the category look with the app's icons — Owner (Crown), Product Owner (Star), Scrum Master (Shield), Admin (Key), Member (none). No role is amber. `projectRole` replaces `role`, which shadowed the ARIA attribute: `role` now reaches the DOM like any other attribute.
- **Final reviews** (C2, 2026-10-20): `signups.open` green · `signups.closed` grey · `slot.free` green (bookable, like `project.open`) · `slot.yours` blue · `live` blue · `slot.past` grey (a free slot that has started) · staff gaps `review.no_review_ta` and `review.no_product_owner` amber (someone should act soon, like `roster.not_on_roster`). See `design_handoff_final_review_signup/NOTES.md`.
- `gold` stays for achievements ("★ Team set"); `solid` for the rare emphasised status. Counts are CountBadge (neutral) or UnreadBadge (red).
- **What's new** (2026-10-23): `release.new` blue ("New") marks a release entry newer than the version this browser last saw, and the profile menu's "What's new" row. **`size="sm"`** (2px 8px, 11px) is the marker size for a heading row or a 32px menu row — `<Badge status="release.new" size="sm" />`. Inside a dark Modal it takes the dark variant's translucent blue. It is never the unread red, and it is not the entry's "New" group label (a plain caps heading).
