The small blue dot that says there is something new to read (release notes this browser has not opened), drawn on the corner of an icon or an avatar.

## Use

```jsx
<NewDot ring style={corner} />
```

Here `corner` is `{ position: 'absolute', top: -1, right: -1 }` on a dot inside a `position: relative` box around an Avatar or an icon. On a screen, position it from your own class.

## Props that matter

- `ring`: a 2px ring in the surface colour behind the dot (`--gt-new-dot-ring`), so it stays a dot over a photo, initials or an icon's stroke. A dark host re-colours the ring from its own class.
- `className` and `style`: where it sits. The dot has no offset of its own.

It is 8px, blue (`--gt-new-dot`, the informational colour) and hidden from screen readers.

## The consumer supplies

- The words. The control the dot sits on keeps its name ("What's new", "Profile menu") and, while the dot shows, is also described by a visually hidden "New release notes" through `aria-describedby`.
- When it shows: only while there is something unseen.

## Do and don't

- Do use it for "new to read", where nothing is waiting on a reply.
- Don't use it for unread messages or a count: that is the red UnreadBadge.
- Don't change the control's name while the dot shows; describe it instead.
- Don't use it inside a list row: the "New" marker on a row is `<Badge status="release.new" size="sm" />`.
