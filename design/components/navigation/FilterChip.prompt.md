Narrow a list. Promotes the search palette's scope chip (`.gt-scope`), analytics' range chip (`.gt-filter__chip`) and the schedule's kind chip into one `.gt-filter-chip`. WAI-ARIA: a **single-choice** row is a Radio Group (one tab stop, arrows move and select); **multi-choice** chips are toggle Buttons (`aria-pressed`).

```jsx
<FilterChipGroup type="single" ariaLabel="Date range" value={range} onChange={setRange}
  options={[{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'term', label: 'This term' }]} />
<FilterChipGroup ariaLabel="Kinds" size="sm" value={kinds} onChange={setKinds}
  options={[{ value: 'ta', label: 'TA meetings', count: 3 }, { value: 'review', label: 'Final reviews' }]} />
```

- Sizes: sm 26px / 0 10px / 11.5px (palette scopes, schedule kinds) · md 32px / 0 14px / 12.5px (analytics range). 44px on phones.
- Look: pill, 1px `--gt-border`, white, secondary text; hover green-tinted (`--gt-primary-soft`, green-200 border, green-700 text); selected solid `--gt-primary` with white text — selected toggle chips also show a check, so the state is not colour alone. Count in tertiary (white when selected).
- Choosing: FilterChip narrows a list · SegmentedControl switches the view or unit · Tabs switch panels. Palette scopes are single-choice (radio); the schedule's kinds are multi (pressed).
