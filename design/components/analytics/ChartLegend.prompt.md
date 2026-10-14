`.gt-legend` chart legend (line or rect swatches via `seriesClass`, optional status icon, optional value) plus `AnalyticsIcon`, the lucide-shaped glyph set the analytics family uses.

```jsx
<ChartLegend items={[
  { key: 'team', label: 'Team channels', swatch: 'line', seriesClass: 'gt-series--1' },
  { key: 'dm', label: 'Direct', swatch: 'line', seriesClass: 'gt-series--2' },
]} hidden={hidden} onToggle={k => toggle(k)} />
<AnalyticsIcon name="download" size={14} />
```

Two or more series always get a legend; one series never does. Toggling isolates a series (`.gt-legend__item--off`). Status legends (`icon`) never double as series colors.
