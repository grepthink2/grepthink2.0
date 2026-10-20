Native `<select>` in the FieldShell — the right control for short, fixed lists: role, term, sprint, duration. Keyboard and screen-reader behaviour are the browser's; help and error are linked with `aria-describedby`, `aria-invalid` follows `error`.

```jsx
<Select label="Duration" value={d} onChange={(e) => setD(e.target.value)} options={DURATIONS} />
<Select label="Sprint" compact options={[{ label: 'Current', options: [{ value: 's3', label: 'Sprint 3' }] }, { label: 'Past', options: past }]} />
```

Searchable, async, creatable or multi-select lists are the Combobox. The class and school switchers stay Menus. `compact` = 32px (44 on phones).
