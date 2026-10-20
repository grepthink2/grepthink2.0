Switch the **view or unit of the same content** — Table / Cards, Tasks / Points, Week / Month. WAI-ARIA: Radio Group pattern (`radiogroup` / `radio`, roving tabindex; arrows and Home / End move *and* select — the analytics range model, now everywhere).

```jsx
<SegmentedControl ariaLabel="View" value={view} onChange={setView}
  options={[{ value: 'table', label: 'Table', icon: <Table2 size={14} /> }, { value: 'cards', label: 'Cards', icon: <LayoutGrid size={14} /> }]} />
<SegmentedControl ariaLabel="Unit" size="sm" value={unit} onChange={setUnit} options={[{ value: 'tasks', label: 'Tasks' }, { value: 'points', label: 'Points' }]} />
```

Same grey track as Tabs (4px padding, white active option with a 1px shadow, 600 weight), but it **sizes to its options**, where Tabs stretch — the deliberate visible difference; screen readers hear "radio, 1 of 2" instead of "tab". Optional `count` per option. Phones: full width, 44px options. Not for filters (FilterChip) or panels (Tabs).
