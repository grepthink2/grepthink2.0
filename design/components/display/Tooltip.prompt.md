Short one-line labels on hover and keyboard focus. WAI-ARIA: Tooltip pattern (`role="tooltip"`, linked with `aria-describedby`; Esc dismisses).

```jsx
<Tooltip content="Percent contribution this sprint"><Badge tone="info">25%</Badge></Tooltip>
<Tooltip content="Sprint 3 ends today" focusable={false}>…inside a card button…</Tooltip>
```

- Bubble: gray-900, white caption, radius 7, 6px from the trigger, 0.2s fade (none under reduced motion). Shows on hover, on the trigger's keyboard focus, and — with `focusable={false}` (adopted from the codebase) — whenever the enclosing control has keyboard focus.
- **Esc hides an open bubble** (WCAG 1.4.13). `useTooltipDismiss(enabled)` — adopted from the codebase (PR #259) — listens on `window` in the capture phase and stops the key only while a bubble shows, so inside a Modal the first Esc closes the bubble and the second closes the dialog (innermost layer first, like Popover and the palette).
- **Activating the control also hides it**: a mouse or pen press, or Enter / Space on it — its label has been read, and the first Esc then reaches what the press opened (a menu). A touch press keeps it, since a tap is how a phone shows a bubble.
- **It comes back** when the pointer enters again or focus arrives by keyboard; the focus a press brings does not bring it back. Keyboard focus is judged the way browsers decide `:focus-visible`: focus that arrived after a key, or a key pressed (no Ctrl / Meta / Alt) while a click-focused control has focus.
- `handlers` (spread on the `.gt-tooltip` element): `onPointerEnter`, `onPointerLeave`, `onPointerDown`, `onFocus`, `onBlur`, `onKeyDown`; add `gt-tooltip--dismissed` while `dismissed`. IconButton's built-in tooltip uses the same hook.
- IconButton shows its `ariaLabel` this way by default.
- Never put essential information or interactive content in a tooltip; anything that explains is an InfoPopover.
