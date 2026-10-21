Icon-only action. WAI-ARIA: Button pattern (toggle button with `pressed`); the label shows as a Tooltip on hover and focus.

```jsx
<IconButton ariaLabel="Close" onClick={onClose}><X size={18} /></IconButton>
<IconButton ariaLabel="More actions" size="sm"><MoreHorizontal size={16} /></IconButton>
<IconButton ariaLabel="Bold" size="sm" pressed={bold} onClick={toggleBold}><Bold size={14} /></IconButton>
```

- `ariaLabel` is required — every icon-only button needs a name. Canonical: "Close" for a modal or drawer × (`md` ghost), "Dismiss" for alerts, toasts and banners, "Remove {name}" for chips.
- Tooltip: on by default with the label (CSS, 0.2s fade, `aria-hidden`); `tooltip="…"` for different visible text, `tooltip={false}` where the control sits inside something that already shows a tooltip, or when absolutely positioned (the tooltip wraps the button in an inline span).
- Esc hides an open tooltip bubble (WCAG 1.4.13, shared `useTooltipDismiss`, adopted from the codebase): heard on `window` in the capture phase and stopped only while the bubble shows, so the first Esc closes only the bubble. Pressing the button (mouse, pen, Enter or Space — not a touch) hides it too, so the first Esc after it opens a menu closes the menu. It comes back when the pointer enters again or focus arrives by keyboard (a key pressed while a click-focused button has focus counts).
- **Disabled**: no bubble, but the `gt-icon-tip gt-tooltip` wrapper stays, so the button is the same element when it turns disabled and back (focus and refs survive). `tooltip={false}` drops the wrapper.
- `aria-label` / `aria-pressed` are set from `ariaLabel` / `pressed` after the caller's props and typed `never`.
- `pressed` → `aria-pressed`, soft green fill + green border. Under 768px the box is at least 44 × 44.
