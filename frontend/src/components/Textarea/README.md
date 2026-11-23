A labelled multi-line text field for feedback, descriptions and notes, with a character counter when it has a limit.

## Use

```jsx
<Textarea label="What went well?" value={went} onChange={(e) => setWent(e.target.value)} maxLength={500} />
```

Past the limit the text stays, the counter and border turn red, and the form's own validation says what to do:

```jsx
<Textarea
  label="Note"
  optional
  rows={2}
  value={note}
  onChange={(e) => setNote(e.target.value)}
  maxLength={LIMIT}
  error={note.length > LIMIT ? `Shorten this by ${note.length - LIMIT} characters.` : undefined}
/>
```

## Props that matter

- `label`, `hideLabel`, `optional`, `helperText` and `error`, as on every field.
- `value` with `onChange`, or `defaultValue` for an uncontrolled field.
- `rows`, default 4: the starting height, never under 90px. The person can drag it taller.
- `maxLength` is a soft limit, never the native attribute: the "128 / 500" counter always shows (hide it with `showCount={false}`), and past it the field is marked invalid while the text is kept.
- `disabled`: a sunken fill with the text still readable.
- Any other textarea prop reaches the `<textarea>`.

A screen reader hears the counter as "128 of 500 characters", and a polite announcement at 20 left, at the limit and when over, not on every keystroke.

## The consumer supplies

- The label, the value, and the error text when the limit is passed ("Shorten this by 12 characters."). The form refuses to save while it is over.

## Do and don't

- Do use one limit style everywhere: `maxLength` and the counter, nothing cut.
- Don't use a Textarea for a single line: that is an Input.
- Don't hide the counter on a field that has a limit the person can reach.
