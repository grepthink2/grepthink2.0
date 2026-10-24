Progress toward done, or a measurement. The app has 8 meters and only one has semantics; every one becomes this.

```jsx
<ProgressBar value={68} label="Sprint 3" showLabel valueText="17 of 25 points" />
<ProgressBar value={25} label="Contribution" meter showLabel />
<span className="row">5 / 8 <ProgressBar inline decorative value={5} max={8} /></span>
```

- Full bar: label + % head (hidden from AT — the bar carries the name and value), 4 / 8 / 12px track in `--gt-gray-100`, green / blue / warning / error fill, 0.3s width transition (none under reduced motion).
- `inline`: 4px on `--gt-gray-200`, no label — table cells, story cards, the sprint picker. Mark it `decorative` when the number is printed beside it; otherwise it is a named `progressbar`.
- `meter` for shares and scores (contribution %), `progressbar` for completion. Pass `valueText` when "68%" isn't the meaningful reading.
