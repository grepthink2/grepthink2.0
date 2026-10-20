Neutral count pill for **everything that is not unread**: tab counts, list totals, "Past (3)". Replaces the 26px green count recipe the app copied four times.

```jsx
<CountBadge count={12} />
<CountBadge count={3} label="3 pending requests" />
```

18px tall, min 18 wide, radius 9, `--gt-gray-100` fill (gray-200 inside an inactive Tabs track), secondary text 11/600, tabular figures, "99+" cap. Unread counts are UnreadBadge — never colour a CountBadge.
