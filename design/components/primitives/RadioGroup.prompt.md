One-of-N choice. WAI-ARIA: Radio Group pattern, built on native radios in a `<fieldset>` (Tab enters the group at the checked option, arrow keys move and select).

```jsx
<RadioGroup legend="Project visibility" value={v} onChange={setV}
  options={[{ value: 'open', label: 'Open', description: 'Anyone can request to join' }, { value: 'invite', label: 'Invite only' }]} />

<RadioGroup variant="card" legend="Status" value={status} onChange={setStatus}
  options={[{ value: 'draft', label: 'Draft', description: 'Only staff can see it' }, { value: 'published', label: 'Published', description: 'Students see it on their home page' }]} />
```

- `variant="card"` replaces the assignment modals' Draft / Published cards and the template picker, which had no radio semantics: bordered cards (1px `--gt-border`, radius 10, 12×14 padding) in an auto-fit grid, title 600, description tertiary; selected = 1px + 1px inset `--gt-primary` border and the filled dot (not colour alone); focus ring on the card.
- The native input covers each row, so the whole card is the hit area; 44px rows on phones.
- No `legend`? Pass `ariaLabel`. More than ~6 options or a searchable list → Select or Combobox.
