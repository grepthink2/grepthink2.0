The neutral grey count pill for list totals and tab counts, for every count that is not unread.

## Use

```jsx
<CountBadge count={12} />
<CountBadge count={3} label="3 pending requests" />
```

## Props that matter

- `count`: the number. Past `max` (default 99) it reads "99+".
- `label`: what a screen reader hears instead of the bare number ("3 pending requests").
- `showZero`, default `true`: shows "0" (a tab with nothing in it yet); `false` renders nothing at 0.

It is 18px tall, grey, with tabular figures, and sits beside the label it counts.

## The consumer supplies

- The count, and a `label` when the number alone would not make sense out of context.

## Do and don't

- Do use it for totals: members, requests, "Past (3)".
- Don't use it for unread messages or notifications: that is the red UnreadBadge.
- Don't colour it to signal a state: a state is a Badge.
