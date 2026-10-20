Short one-line labels on hover and keyboard focus. WAI-ARIA: Tooltip pattern (`role="tooltip"`, linked with `aria-describedby`).

```jsx
<Tooltip content="Percent contribution this sprint"><Badge tone="info">25%</Badge></Tooltip>
<Tooltip content="Sprint 3 ends today" focusable={false}>…inside a card button…</Tooltip>
```

- Bubble: gray-900, white caption, radius 7, 6px from the trigger, 0.2s fade (none under reduced motion). Shows on hover, on the trigger's focus, and — with `focusable={false}` (adopted from the codebase) — whenever the enclosing control has keyboard focus.
- IconButton shows its `ariaLabel` this way by default.
- Never put essential information or interactive content in a tooltip; anything that explains is an InfoPopover.
