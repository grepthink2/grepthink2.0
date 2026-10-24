The `.gt-field` shell behind every form control: label, control, error or help line, counter. Use it to build a field the kit does not have yet; never hand-roll label / help / error markup.

```jsx
<FieldShell label="Display name" optional helperText="Shown to your team" error={err} count={v.length} max={40}>
  {({ id, describedBy, invalid }) => (
    <input id={id} className="gt-input" aria-describedby={describedBy} aria-invalid={invalid || undefined} value={v} onChange={…} />
  )}
</FieldShell>
```

- Marking: optional fields get "(optional)"; required fields get no visible mark (`required` on the control still tells screen readers).
- `hideLabel` keeps the label for screen readers only. `group` renders the label as a `<span id>` for `role="group"` controls (`aria-labelledby={labelId}`).
- Errors read "Give the meeting a title." style copy, sit under the field with an alert glyph, and are linked through `aria-describedby`; `aria-invalid` follows.
- Counter: "128 / 500", tertiary, tabular. Over the limit: error colour + error border; the text stays (the form's validation blocks the save). A polite live region speaks at 20 left, at the limit and when over — not on every keystroke.
