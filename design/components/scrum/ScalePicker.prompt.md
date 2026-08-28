Estimate scales: `ScalePicker` picks linear / exponential / fibonacci at project level; `PointPicker` offers that scale's values when estimating.

```jsx
<ScalePicker value={scale} onChange={setScale} />
<PointPicker scale={scale} value={points} onChange={setPoints} />
```

`ESTIMATE_SCALES` maps scale → values (fibonacci: 1 2 3 5 8 13).
