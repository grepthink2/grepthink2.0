A small floating panel hung from a button (settings, a short form, a Menu), which closes on Esc or a press outside and never traps focus.

## Use

```jsx
<Popover
  open={open}
  onClose={() => setOpen(false)}
  anchor={<IconButton ariaLabel="Board settings" onClick={() => setOpen(!open)}><Settings size={16} /></IconButton>}
>
  …a heading and two Toggles, in a 240px column
</Popover>
```

## Props that matter

- `open` and `onClose`: Esc and a press outside call it. An open popover takes Esc first, so one inside a dialog closes alone.
- `anchor`: the control it hangs from, rendered whether or not it is open. Its `onClick` toggles `open`.
- `placement`, default `bottom` (or `top`); `align`, default `start` (or `end`, for an anchor near the right edge). It sits 6px from the anchor.
- `size`, default `md`; `sm` has a smaller radius and tighter padding.
- `padded`, default `true`; `false` for a Menu, which brings its own padding.
- Other props (`role`, `aria-labelledby`, `className`) reach the panel.

The panel is at least 180px wide; give its content the width it needs. It fades and slides 6px in.

## The consumer supplies

- The anchor and `open`, the content, and a name for the panel when it holds more than a menu (`role="dialog"` with `aria-labelledby`).

## Do and don't

- Do use a Popover for a few controls that belong to one button; a Menu inside one for a list of actions.
- Do use an InfoPopover for an explanation behind an ⓘ.
- Don't put a long form in a Popover: that is a Modal or a Drawer.
