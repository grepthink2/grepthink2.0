A button shown as an icon alone (a dialog's close, a row's overflow menu, a toolbar toggle), named by a label that also shows as its tooltip.

## Use

```jsx
<IconButton ariaLabel="Close" onClick={close}><X size={18} /></IconButton>
<IconButton ariaLabel="More actions" variant="solid" size="sm"><MoreHorizontal size={16} /></IconButton>
<IconButton ariaLabel="Bold" size="sm" pressed={bold} onClick={() => setBold(!bold)}><Bold size={14} /></IconButton>
```

## Props that matter

- `ariaLabel`, required: the button's name. Use the app's words: "Close" for a dialog's or drawer's ×, "Dismiss" for an alert, toast or banner, "Remove {name}" for a chip.
- The icon, as children: a lucide icon, 14px in `sm`, 16 to 18px in `md`, 20px in `lg`.
- `variant`, default `ghost` (no fill until hovered): `solid` (a grey box) or `danger` (red, for a destructive action).
- `size`, default `md`: `sm` 28px, `md` 36px, `lg` 44px. Every size is 44px on phones.
- `pressed`: a toggle (`aria-pressed`), drawn with a soft green fill and border.
- `tooltip`, default `true` (shows `ariaLabel` on hover and keyboard focus): a string shows other text; `false` shows none, for a button inside something that already shows a tooltip or one positioned absolutely.
- `tooltipSide`, default `top`: `bottom`, `left` or `right`.
- `disabled`: no tooltip while disabled. Other button props reach the `<button>`.

Esc hides an open tooltip before anything else hears it, and pressing the button hides it too.

## The consumer supplies

- The label and the handler. The label says the action, not the icon ("Delete", not "Trash can").

## Do and don't

- Do use an icon whose meaning is common (×, ⋯, a pencil); anything less common gets a Button with a label.
- Don't leave out `ariaLabel` or rely on the icon alone to name the action.
- Don't put a `title` on it: the tooltip already shows the label.
