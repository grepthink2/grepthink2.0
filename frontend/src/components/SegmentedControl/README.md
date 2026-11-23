A small grey track of options for switching the view or the unit of the same content (Table or Cards, Tasks or Points), with one option chosen at a time.

## Use

```jsx
<SegmentedControl
  ariaLabel="View"
  value={view}
  onChange={setView}
  options={[
    { value: 'table', label: 'Table', icon: <List size={14} /> },
    { value: 'cards', label: 'Cards', icon: <LayoutGrid size={14} /> },
  ]}
/>
<SegmentedControl ariaLabel="Unit" size="sm" value={unit} onChange={setUnit} options={[{ value: 'tasks', label: 'Tasks' }, { value: 'points', label: 'Points' }]} />
```

## Props that matter

- `ariaLabel`, required: names the group ("View", "Unit").
- `options`: `{ value, label, icon?, count?, ariaLabel?, disabled? }`. An icon-only option passes an empty label and its own `ariaLabel`.
- `value` and `onChange`, which receives the chosen value.
- `size`, default `md` (30px options); `sm` is 24px. Both are 44px on phones.
- `fullWidth`: stretches the options across the container, as it always does on phones.

It sizes to its options, where Tabs stretch across their track. It is a radio group: one tab stop, and the arrow keys move and select.

## The consumer supplies

- The options and the chosen value, and the view that changes with it.

## Do and don't

- Do keep it to two to four short options.
- Don't use it to switch between panels of different content: that is Tabs.
- Don't use it to filter a list: that is a FilterChip.
