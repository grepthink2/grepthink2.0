`.gt-chart-tip` chart tooltip + the shared chart helpers (`useMeasure`, `useChartTip`, `fmtCompact`, `fmtPct`, `fmtDelta`, `fmtWeek`, `fmtRange`, `niceScale`; exposed together as `ChartFormat`). Tooltips enhance, never gate — every value is also in the table twin.

```jsx
const { tip, show, hide } = useChartTip();
<div className="gt-plot" ref={ref}>
  <svg …>{/* marks call show(x, y, 'Week of Sep 7', [{label:'Team channels', value:'21', seriesClass:'gt-series--1'}]) */}</svg>
  {tip && <ChartTooltip {...tip} />}
</div>
```

Rows are keyed by a short colored line (`seriesClass` sets `--series`), not a box. Keyboard focus on a mark shows the same tooltip as hover. Date labels: `fmtWeek` → "Sep 7", `fmtRange` → "Sep 8 – Oct 7" or "Dec 25, 2025 – Jan 5, 2026".
