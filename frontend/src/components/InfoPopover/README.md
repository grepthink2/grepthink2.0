An ⓘ button that opens a short explanation (what a figure counts, or why a control beside it is disabled), reachable by keyboard and touch.

## Use

```jsx
<InfoPopover
  ref={first}
  title="How TSRs are counted"
  label="About TSRs submitted"
  body="Submitted reports this sprint, out of everyone enrolled. Late submissions count."
/>
<InfoPopover title="Why can't I publish?" body="Add at least one question first." />
```

The preview opens the first one on its own (the `ref` reaches the ⓘ); on a screen it opens when clicked.

## Props that matter

- `title`: the panel's heading, which names it, and the ⓘ's name unless `label` is set.
- `label`: the ⓘ's name when it should say what it explains ("About TSRs submitted").
- `body`: one or two sentences.
- `learnMoreHref`: adds a "Learn more" link.
- `placement`, default `bottom` (or `top`); `align`, default `start` (or `end`, for an ⓘ near the right edge).

It opens on a click, Enter or Space, as a non-modal panel; Esc or a press outside closes it without closing a dialog around it, and focus is never trapped. Once open, the panel moves just enough to stay inside the window.

## The consumer supplies

- The title and the body, and a `label` when several ⓘ on one screen would otherwise share a name.

## Do and don't

- Do put one beside a disabled control to say why it is disabled: a disabled control cannot take focus, so a `title` on it is never read.
- Do use a Tooltip, not this, for a short label naming an icon.
- Don't put a form or a list of actions in it: that is a Popover or a Menu.
