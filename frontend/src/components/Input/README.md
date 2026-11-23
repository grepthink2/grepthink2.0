A labelled single-line text field, with room for an icon, a fixed prefix, a unit or a button inside its border.

## Use

```jsx
<Input
  label="Project name"
  value={name}
  onChange={(e) => setName(e.target.value)}
  helperText="Your team and your TA see it."
  maxLength={40}
  showCount
/>
<Input label="LinkedIn" optional prefixText="linkedin.com/in/" value={linkedIn} onChange={(e) => setLinkedIn(e.target.value)} />
<Input label="Meeting title" defaultValue="" error="Give the meeting a title." />
```

A toolbar filter, with its label kept for screen readers:

```jsx
<Input label="Search members" hideLabel compact iconLeft={<Search size={15} />} placeholder="Search members…" />
```

## Props that matter

- `label` names the field; `hideLabel` keeps it for screen readers only. `optional` adds "(optional)"; a required field has no visible mark.
- `value` with `onChange` (the native change event), or `defaultValue` for an uncontrolled field.
- `helperText` under the field; `error` replaces it, turns the border red and marks the field invalid.
- `maxLength` is a soft limit, not the native attribute: the "14 / 40" counter appears from 80% of it (always with `showCount`), and past it the field turns red and is invalid, but the text is kept.
- Inside the border: `iconLeft` (a 16px icon), `prefixText` (fixed text before the value: "linkedin.com/in/", "@"), `suffix` (a unit: "hrs") and `action` (a small button, as PasswordField's eye).
- `compact`: 32px tall instead of 40px, for toolbars and filter rows. Every field is 44px on phones.
- `type`, default `text`; any other input prop (`name`, `autoComplete`, `inputMode`) reaches the `<input>`.
- `disabled`: a sunken fill with the value still readable.

## The consumer supplies

- A label for every field, visible unless the context names it (a toolbar search).
- Validation: the error text, and refusing a value past `maxLength` when the form is saved.

## Do and don't

- Do write the error as what to do next ("Give the meeting a title.").
- Do use Textarea for more than a line, SearchField for a list's search box, PasswordField for a password.
- Don't use a placeholder as the label, or to hold instructions that disappear as the person types.
- Don't set the native `maxlength`: pasted text would be cut without a word.
