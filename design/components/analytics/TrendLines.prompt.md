Week-by-week small multiples (`.gt-trend`) — messages/team/week, tasks created/team/week, points done/team (+ on-time rate once timeliness ships) — with the previous range as gray context: one series is the point, the other is context. Only complete weeks are drawn (`completeWeeks(points, asOf)`); the week in progress appears once it ends.

```jsx
<TrendLines panels={data.trends.panels} compare={compare} asOf={data.trends.as_of} view={table ? 'table' : 'chart'} />
```

`__marker` dots each week no line reaches and this range's latest week, which `__end-label` labels; `null` points leave gaps. Footer: "This range · Previous range" legend + "as of Oct 6, 2026". Empty states (derived or `emptyReason`): "Trends appear after the first nightly rollup." · "No complete week in this range yet." · "No team activity in this range." Table view: one row per complete week, one column per panel with its unit, "—" for a missing value. The header's "Compare with previous range" checkbox is `ChartCardCheck`; the Table toggle is `ChartCardTool`.
