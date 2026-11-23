A horizontal bar for progress toward done (a sprint's points) or for a measurement (a contribution share), with an optional label and percentage.

## Use

```jsx
<ProgressBar value={68} label="Sprint 3" showLabel valueText="17 of 25 points" />
<ProgressBar value={25} label="Contribution" meter showLabel tone="blue" />
```

Inline in a table cell, beside its own number:

```jsx
<ProgressBar inline decorative value={5} max={8} style={{ width: 120 }} />
```

## Props that matter

- `value` and `max` (default 100). The bar fills from 0 to `max`; a value outside it is held at the end.
- `label`: the visible label above the bar, and its name. `showLabel` adds the percentage on the right.
- `valueText`: what a screen reader hears when "68%" is not the meaningful reading ("17 of 25 points").
- `tone`, default `primary` (green): `blue`, `warning` or `error`.
- `size`, default `md`: the track is 4, 8 or 12px (`sm`, `md`, `lg`).
- `inline`: the 4px bar with no label, for table cells, story cards and the sprint picker. Give it a width.
- `decorative`: hidden from screen readers, for a bar whose number is printed beside it.
- `meter`: a measurement (`role="meter"`) instead of progress toward done (`role="progressbar"`).

## The consumer supplies

- The value, and a `label` or the number beside it: a bar alone says nothing exact.

## Do and don't

- Do use `meter` for a share or a score, and the default for completion.
- Do pass `valueText` whenever the unit is not a percentage.
- Don't use colour alone to carry meaning: say "Over budget" in the label.
- Don't use a ProgressBar for a wait with no known end: that is a Spinner or a Skeleton.
