A one-line label that shows on hover and on keyboard focus, for naming an icon or adding a short note to a figure.

## Use

```jsx
<Tooltip content="Percent contribution this sprint"><Badge tone="info">25%</Badge></Tooltip>
<Tooltip content="Sprint 3 ends today" side="bottom"><Clock size={16} aria-label="Sprint end" /></Tooltip>
```

## Props that matter

- `content`: one short line.
- `side`, default `top`: `bottom`, `left` or `right`.
- `focusable`, default `true`: the trigger joins the tab order so a keyboard can show the bubble. Pass `false` when the trigger sits inside another control (a card that is itself a button); the bubble then shows while that control has keyboard focus.

The bubble is dark with white text and appears at once. It describes its trigger (`role="tooltip"`), Esc hides it without closing a dialog around it, and pressing the trigger hides it too.

## The consumer supplies

- The trigger, as children, and the line.

## Do and don't

- Do keep it to a few words that add to what is already visible.
- Don't put anything essential, or anything to click, in a tooltip: a touch screen may never show it. An explanation is an InfoPopover.
- Don't wrap an IconButton in a Tooltip: its `ariaLabel` already shows as one.
