Burnup chart: green completed line + soft area vs dashed scope line. Same component serves per-sprint (labels = days) and cumulative (labels = sprints).

```jsx
<BurnupChart title="Sprint 3 burnup" subtitle="Jan 12 – Jan 25"
  labels={['M','T','W','T','F','M','T','W','T','F']}
  scope={[21,21,21,24,24,24,24,24,24,24]}
  completed={[0,2,5,5,9,12,15,18,21,24]} />
```

Production maps the same data shape onto recharts (`CHART_COLORS`).
