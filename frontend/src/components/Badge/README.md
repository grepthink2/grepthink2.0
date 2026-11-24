A status, category or role pill: you name what the thing is, and the preset decides its colour and its words.

## Use

```jsx
<Badge status="task.blocked" />
<Badge status="attendance.late" />
<Badge status="request.pending">Invited</Badge>
<Badge category="sponsored" />
<Badge projectRole="product owner" />
```

The small marker for a heading row or a 32px menu row:

```jsx
<Badge status="release.new" size="sm" />
```

## Props that matter

- `status`: a preset key, `area.state` (`task.blocked`, `assignment.due_soon`, `slot.yours`). The card lists every key by area. Its colour follows one rule: green is done or positive, blue in progress or informational, amber needs attention soon, red a problem, grey not started or inactive. Pull requests keep GitHub's colours (Merged is purple).
- Children replace the preset's words and keep its colour (`request.pending` read as "Invited").
- `category`: a label that is not a status (`ta`, `instructor`, `team`, `sponsored`, `manual`, `members`), drawn white and outlined with an icon. It never borrows a status colour.
- `projectRole`: a project role in the category look with its icon (Owner, Product Owner, Scrum Master, Admin, Member). It takes the stored value, `'product owner'`, as well as `product_owner`.
- `size`, default `md`; `sm` is the 11px marker.
- `icon`: replaces the preset's icon; `null` drops it.
- `tone`: a raw colour (`neutral`, `success`, `warning`, `error`, `info`, `gold`, `merged`), only when no preset fits. `solid`: a filled pill, for the rare emphasised status.

A Badge is not interactive and sets no ARIA role.

## The consumer supplies

- The status key from the data. `badgeStatus` exports `BADGE_STATUS`, `BADGE_CATEGORY` and `PROJECT_ROLES` (each key's look and words), `toProjectRoleKey` for a stored role, and `roleKey`, which turns any role text into a key the same way ('Product Owner' → `product_owner`).

## Do and don't

- Do name the status (`<Badge status="attendance.late" />`), never a colour.
- Do add a preset when a new status appears, rather than passing `tone`.
- Don't make a role amber, or a category a status colour.
- Don't use a Badge for a count: a count is a CountBadge, an unread count an UnreadBadge.
