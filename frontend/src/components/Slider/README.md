A labelled range for picking a number by dragging or with the arrow keys, with its value shown beside the track.

## Use

```jsx
<Slider label="Maya Chen (you)" unit="%" value={mine} onChange={setMine} />
<Slider label="Leo Park" unit="%" withInput color="var(--gt-avatar-2)" value={leo} onChange={setLeo} />
```

## Props that matter

- `label`: the slider's name, required (`hideLabel` keeps it for screen readers only).
- `value` with `onChange`, which receives the new number, snapped to `step` and kept within `min`…`max`, or `defaultValue`.
- `min` (default 0), `max` (default 100), `step` (default 1), `pageStep` (Page Up / Page Down; default a tenth of the range).
- `unit` ("%", " pts") follows the value; `formatValue` replaces the shown text, and `valueText` what a screen reader hears ("25 percent of the work").
- `withInput`: a small number input beside the track instead of the read-only value. A value typed in range moves the slider at once; anything else is pulled into range when the input loses focus.
- `color`: the fill and thumb, as a token (`var(--gt-avatar-2)`) matching a legend swatch. Default the primary green.
- `helperText`, `error` (turns the fill and thumb red and marks it invalid), `optional`, `disabled`.

Keys: the arrows move one step, Page Up and Page Down one `pageStep`, Home and End to the ends.

## The consumer supplies

- The label and the value state, and any rule across several sliders (shares that must add up to 100%).

## Do and don't

- Do put a rule that spans several sliders in one Alert or help line under the group, not an error on every slider.
- Do take `color` from the avatar or chart tokens, never a hex value.
- Don't use a Slider where the exact number matters more than the feel: use an Input with `type="number"`, or `withInput`.
