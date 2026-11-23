A one-of-many choice as a group of radios, as a list or as option cards with a title and a description.

## Use

```jsx
<RadioGroup
  legend="Project visibility"
  value={visibility}
  onChange={setVisibility}
  options={[
    { value: 'open', label: 'Open', description: 'Anyone in the class can ask to join.' },
    { value: 'invite', label: 'Invite only' },
  ]}
/>
```

Cards, for a choice whose options need a sentence each (the Draft or Published status of an assignment):

```jsx
<RadioGroup
  variant="card"
  legend="Status"
  value={status}
  onChange={setStatus}
  options={[
    { value: 'draft', label: 'Draft', description: 'Only staff can see it.' },
    { value: 'published', label: 'Published', description: 'Students see it on their home page.' },
  ]}
/>
```

## Props that matter

- `options`: `{ value, label, description?, disabled? }` each. The label names a radio; the description describes it.
- `value` with `onChange`, which receives the chosen value (a string, not the event), or `defaultValue` for an uncontrolled group.
- `legend`: the group's visible name. Without one, pass `ariaLabel`.
- `variant`, default `list`: `card` makes each option a bordered card in a grid (at least 200px a card), with a green border and a filled dot when selected.
- `inline`: the options side by side (list variant only), for two or three short labels.
- `disabled` disables the whole group; an option's own `disabled` disables just that one.
- `name`: the radios' shared name, generated when left out.

Tab enters the group at the chosen option, and the arrow keys move and select. The whole row, or the whole card, is the click target.

## The consumer supplies

- A `legend` or an `ariaLabel`, the options, and the chosen value.

## Do and don't

- Do use a RadioGroup for two to about six options that should all stay in view.
- Don't use one for a long or searchable list: that is a Select.
- Don't use radios to switch the view of the same content: that is a SegmentedControl.
- Don't leave a group with nothing chosen when one option is the sensible default.
