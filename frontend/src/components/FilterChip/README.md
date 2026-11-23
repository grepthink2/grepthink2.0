A pill that narrows a list (a date range, the kinds of item shown), alone or in a group that allows one choice or several.

## Use

```jsx
<FilterChipGroup
  type="single"
  ariaLabel="Date range"
  value={range}
  onChange={setRange}
  options={[{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'term', label: 'This term' }]}
/>
<FilterChip selected={starred} icon={<Star size={14} />} onClick={() => setStarred(!starred)}>Starred</FilterChip>
```

## Props that matter

- Children: the label. `selected`: solid green with white text; a selected toggle chip also shows a check in place of its icon, so the state is not colour alone.
- `count`: a small number after the label.
- `icon`: a 14px lucide icon before the label.
- `size`, default `md` (32px); `sm` is 26px. Both are 44px on phones.
- `kind`, default `toggle` (a pressed button); `radio` inside a single-choice group, which sets it for you.
- Other button props reach the `<button>`; `type` defaults to `"button"`.

## The consumer supplies

- The labels, the selected state, and the filtering of the list.

## Do and don't

- Do use FilterChips to narrow a list; a SegmentedControl switches the view of the same content, and Tabs switch between panels of different content.
- Do put a group's chips in a FilterChipGroup, so they read as one control.
- Don't use a FilterChip for a picked value with an ×: that is a Tag.

## FilterChipGroup

A row of chips with the right group behaviour: `type="single"` is a radio group with one tab stop, where the arrow keys move and select; the default, several choices, is a row of pressed toggles, each in the tab order.

```jsx
<FilterChipGroup
  ariaLabel="Kinds"
  size="sm"
  value={kinds}
  onChange={setKinds}
  options={[
    { value: 'ta', label: 'TA meetings', count: 3 },
    { value: 'team', label: 'Team meetings', count: 1 },
    { value: 'review', label: 'Final reviews', disabled: true, title: 'Select a class first' },
  ]}
/>
```

- `ariaLabel`, required: names the group ("Date range").
- `options`: `{ value, label, count?, icon?, disabled?, title? }`. A `title` is a pointer-only hint; say a disabled option's reason in text too when it matters.
- `type="single"` takes a string `value` and calls `onChange` with a string; without it, `value` is a list and `onChange` gets the new list.
- `size`, default `md`.
