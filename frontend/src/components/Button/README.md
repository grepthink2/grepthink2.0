The button for every action a person clicks: pick the variant by how much the action matters and the size by where it sits.

## Use

```jsx
<Button>Save changes</Button>
<Button variant="outline">Cancel</Button>
<Button variant="danger-ghost" size="sm" iconLeft={<Trash2 size={14} />}>Remove</Button>
```

A busy button and a toggle:

```jsx
<Button loading loadingLabel="Saving…">Save changes</Button>
<Button variant="outline" size="sm" pressed={showTable} onClick={() => setShowTable(!showTable)}>Table</Button>
```

## Props that matter

- `variant`, default `primary`:
  - `primary`: the one main action of a view or dialog.
  - `outline`: the usual secondary. Cancel in a dialog, page-toolbar actions (Upload, Export, Refresh). The only secondary that keeps an edge on the grey canvas.
  - `secondary`: a grey fill, only inside white surfaces where a quieter filled button reads better.
  - `ghost`: green text, for tertiary actions ("View all").
  - `danger`: solid red, only for the step that confirms a destructive action.
  - `danger-ghost`: a quiet destructive action in a row (Remove, Unsend, Delete).
- `size`, default `md`: `md` (40px) in forms and pages, `sm` (32px) in rows, cards and toolbars, `lg` (48px) with `fullWidth` on sign-in pages. Under 768px every button is at least 44px tall.
- `loading` with `loadingLabel`: busy. A spinner and the "-ing…" label take the label's place in the same cell, so the width never changes. The button keeps focus, announces itself as busy and ignores clicks.
- `pressed`: makes it a toggle (`aria-pressed`, a soft green fill). Keep the label the same; the pressed look carries the change.
- `iconLeft`, `iconRight`: a lucide icon, 14px in `sm` and 16px otherwise.
- `disabled`: the native attribute, drawn at one opacity.
- `href` renders a link with the button's look (Join Zoom), and `to` a router link (Browse projects). A link cannot be disabled: a disabled one loses its destination.
- `type` defaults to `"button"`; pass `type="submit"` for a form's submit button.

## The consumer supplies

- The label, as children: a verb or a verb phrase ("Save changes", "Remove").
- The `onClick` handler, or the `href` or `to` of a link.
- `loadingLabel` from the start, not only while busy, so its width is reserved.
- A reason beside a disabled button, in helper text or an InfoPopover: a disabled button cannot take focus, so a `title` on it is never read.

## Do and don't

- Do keep one `primary` per view or dialog, and put the outline Cancel before it in a footer.
- Do use IconButton for an action shown as an icon alone; a Button always has a visible label.
- Don't use solid `danger` for the first click of a destructive action: it confirms, in a ConfirmDialog or an InlineConfirm row.
- Don't swap the children to say "Saving…": pass `loading` and `loadingLabel`.
- Don't put a `title` on a disabled button to explain it.

`buttonClassName({ variant, size, fullWidth, loading })` gives the classes a Button renders, for the rare element that cannot be a Button (a `<label>` that opens a file picker). That element sets `aria-pressed` and `disabled` itself.
