Analytics KPI tile. Since the alignment round it is the shared **StatCard** with `compact` and compact number formatting — delta, trend sparkline, `failed`, `loading`, `format` and the new `info` ⓘ all live in `components/display/StatCard.jsx`.

```jsx
<StatTile label="Messages" value={o.messages} icon={<MessageSquare size={16} />}
  delta={{ value: o.deltas.messages, vsLabel: 'vs the 7 days before' }} trend={o.trends.messages} />
```

Port: one `StatCard` component in `frontend/src/components/StatCard/`; the Dashboard's `DashboardMetricCard` and this tile both render it.
