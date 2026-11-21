A labelled native select for a short, fixed list (a role, a term, a sprint, a duration), with the browser's own keyboard and screen-reader behaviour.

## Use

```jsx
<Select label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)} options={DURATIONS} />
<Select label="Role" placeholder="Choose a role" options={[{ value: 'ta', label: 'TA' }, { value: 'student', label: 'Student' }]} />
```

Options can come in groups:

```jsx
<Select
  label="Sprint"
  compact
  value={sprint}
  onChange={(e) => setSprint(e.target.value)}
  options={[
    { label: 'Current', options: [{ value: 's3', label: 'Sprint 3' }] },
    { label: 'Past', options: [{ value: 's2', label: 'Sprint 2' }, { value: 's1', label: 'Sprint 1' }] },
  ]}
/>
```

## Props that matter

- `options`: `{ value, label, disabled? }` items, or `{ label, options }` groups. `<option>` and `<optgroup>` children replace them.
- `value` with `onChange` (the native change event: read `e.target.value`), or `defaultValue` for an uncontrolled select.
- `placeholder`: a disabled first option shown while the value is `''`. An uncontrolled select with a placeholder starts on it.
- `label`, `hideLabel`, `optional`, `helperText` and `error`, as on every field.
- `compact`: 32px instead of 40px, for toolbars and filter rows. 44px on phones.
- `disabled`; other select props reach the `<select>`.

## The consumer supplies

- The label and the options, each with a value and a readable label.

## Do and don't

- Do use a Select for a list of fixed choices, long enough that radios would crowd the form.
- Do use a RadioGroup instead when there are only two or three options that should stay in view.
- Don't use a Select for a list someone needs to search or pick several from.
- Don't leave the first option chosen by accident when nothing is chosen yet: give a `placeholder`.
