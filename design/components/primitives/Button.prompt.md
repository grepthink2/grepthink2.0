Every clickable action. WAI-ARIA: Button pattern (toggle button when `pressed` is set).

```jsx
<Button onClick={save} loading={saving} loadingLabel="Saving…">Save changes</Button>
<Button variant="outline" onClick={close}>Cancel</Button>
<Button variant="danger-ghost" size="sm" iconLeft={<Trash2 size={14} />}>Remove</Button>
<Button variant="outline" size="sm" pressed={showTable} onClick={toggle}>Table</Button>
<Button href={zoomUrl} target="_blank" rel="noreferrer" size="sm">Join Zoom</Button>
```

Which variant:
- `primary` — the one main action of a view or dialog.
- `outline` — the app's usual secondary: Cancel in dialogs, page-toolbar actions (Upload, Timeline, Refresh, Export, Exit preview). The only secondary that keeps an edge on the grey canvas.
- `secondary` — grey fill, only inside white surfaces where a quieter filled button reads better.
- `ghost` — green text, tertiary actions ("View all").
- `danger-ghost` — quiet destructive in rows (Remove, Unsend, Delete). Solid `danger` only confirms: ConfirmDialog or an inline confirm row.

Sizes: `md` in forms and pages · `sm` in rows, cards, toolbars · `lg` + `fullWidth` on sign-in pages. Under 768px every button is at least 44px tall.

Busy: pass `loadingLabel` ("Saving…", "Deleting…"). The spinner and that label replace the idle face in the same grid cell, so the width never changes; the button keeps focus (`aria-disabled`, `aria-busy`) and ignores clicks. Under reduced motion the spinner keeps turning at 1.6s.

Pressed: `pressed` → `aria-pressed`; soft green fill with a green border. Keep the label constant; the pressed state carries the change. Disabled: one opacity (0.45). Explain why a button is disabled in helper text under it or an InfoPopover beside it — a disabled button cannot take focus, so a `title` is unreachable. Default `type="button"`.
