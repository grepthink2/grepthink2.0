The frame every form field shares (label, control, help or error line, counter), for building a field around a control the kit does not have.

## Use

```jsx
<FieldShell label="Team logo" optional helperText="PNG or JPG, up to 2 MB.">
  {({ id, describedBy, invalid }) => (
    <input id={id} type="file" accept="image/png, image/jpeg" aria-describedby={describedBy} aria-invalid={invalid || undefined} />
  )}
</FieldShell>
```

The children are a function: FieldShell hands the control its `id` (the label's target), `describedBy` (the help or error line and the counter) and `invalid`, and the control puts them on itself.

## Props that matter

- `label`, and `hideLabel` to keep it for screen readers only. A placeholder is never the label.
- `optional`: a quiet "(optional)" after the label. A required field carries no visible mark.
- `helperText`, and `error`, which replaces the help line, shows an alert glyph and makes `invalid` true.
- `count` and `max`: a "12 / 40" counter. `max` is a soft limit: past it the field is flagged and `invalid`, and the text is kept. `showCount={false}` keeps the limit with its counter hidden.
- `group`: renders the label as a plain element with the id `labelId`, for a group of controls named with `aria-labelledby` (the boxes of a CodeInput).
- `disabled`: greys the label, beside a control that is disabled.
- `id`: the control's id, generated when left out.

A screen reader hears the counter as "12 of 40 characters", and a polite announcement when 20 characters remain, at the limit and when over, not on every keystroke.

## The consumer supplies

- The control, wired to `id`, `describedBy` and `invalid`.
- The count, when there is a limit, and the validation that refuses to save past it.

## Do and don't

- Do reach for Input, Textarea, Select, DatePickerField, Slider or CodeInput first: each already sits in a FieldShell.
- Do write errors as what to do ("Use at least two characters."), and move focus to the first invalid field when a form is submitted.
- Don't hand-build a label, help line or error under a control: wrap it in a FieldShell.
- Don't cut text at the limit: `max` flags it, and the form refuses it.
