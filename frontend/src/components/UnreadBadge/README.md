The red unread count for messages and notifications, beside a label or on an icon's corner; it renders nothing at zero.

## Use

```jsx
<UnreadBadge count={3} />
<UnreadBadge count={4} dot />
```

On an icon button, the button's name carries the count, since a name given by `aria-label` hides the badge's own text:

```jsx
<IconButton ariaLabel="Notifications, 8 unread"><Bell size={18} /></IconButton>
```

## Props that matter

- `count`: the number. At 0 nothing renders; past `max` (default 99) it reads "99+".
- `label`: what a screen reader hears; default "{count} unread", the real count even past the cap.
- `dot`: an 8px dot with no number, for the collapsed sidebar.

It is always solid red with white bold figures, 18px tall.

## The consumer supplies

- The count, and on an icon button the count in the button's name ("Notifications, 8 unread").
- Its position on an icon's corner, from your own class.

## Do and don't

- Do use it only for things waiting to be read.
- Don't use it for totals: a total is a grey CountBadge.
- Don't use it for "something new" with nothing to read through: that is the blue NewDot.
