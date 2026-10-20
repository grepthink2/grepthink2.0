Icon-only action. WAI-ARIA: Button pattern (toggle button with `pressed`); the label shows as a Tooltip on hover and focus.

```jsx
<IconButton ariaLabel="Close" onClick={onClose}><X size={18} /></IconButton>
<IconButton ariaLabel="More actions" size="sm"><MoreHorizontal size={16} /></IconButton>
<IconButton ariaLabel="Bold" size="sm" pressed={bold} onClick={toggleBold}><Bold size={14} /></IconButton>
```

- `ariaLabel` is required — every icon-only button needs a name. Canonical: "Close" for a modal or drawer × (`md` ghost), "Dismiss" for alerts, toasts and banners, "Remove {name}" for chips.
- Tooltip: on by default with the label (CSS, 0.2s fade, `aria-hidden`); `tooltip="…"` for different visible text, `tooltip={false}` where the control sits inside something that already shows a tooltip, or when absolutely positioned (the tooltip wraps the button in an inline span).
- `pressed` → `aria-pressed`, soft green fill + green border. Under 768px the box is at least 44 × 44.
