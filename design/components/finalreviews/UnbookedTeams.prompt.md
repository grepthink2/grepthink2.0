Staff only — the teams that hold no slot, below the board.

```jsx
<UnbookedTeams teams={unbookedTeams(data, teamsById)} lens={lens} onAction={(a, t) => open(a, t)} />
```
- Title "Teams without a slot" + CountBadge; hint "Each team’s Product Owner books its slot, or you place the team." (instructor).
- Row: name 14/600 · "Product Owner Ana Ruiz" or `<Badge status="review.no_product_owner">` (amber) · "Home TA Sam Okafor" · "Review TA …" when the instructor appointed one ahead of the booking (a first booking keeps it).
- Instructor: **Place on a slot…** (secondary sm → SlotActionDialog `place_on_slot`) and a Menu with **Appoint / Change Review TA…**. "Every team has a slot." when empty.
