KPI tile for the analytics overview row — the app's `DashboardMetricCard` (`.metric-card`) plus two optional slots, `delta` and `trend`. Port by extending `DashboardMetricCard` with `__delta`, `__delta-value`, `__delta-vs`, `__spark`, `__spark-line`, `__spark-dot`; the class Dashboard keeps rendering unchanged.

```jsx
<StatTile label="Messages" value={1284} icon={<MessageSquare size={16} />}
  delta={{ value: 0.18, vsLabel: 'vs previous Sep 8 – Oct 7' }} trend={[12,18,25,31,44,52,61,58,73,88,95,102]} />
<StatTile label="Active users (7d)" value={null} hint="Appears once sign-ins are recorded" />
<StatTile label="Messages" value={212} trend={[180, 212]} />        // 2-point sparkline after the first rollups
```

Delta color = direction × `goodWhenUp` (success-text / error-text), never the series color; no delta for the All preset (`value: null`). Proportional figures, no `tabular-nums`.
