Characters per task / per story as two small multiples (Tasks, Stories) — one green series each, ≤ 24px columns, the median printed on the cap, shared y-scale.

```jsx
<BarsBySprint panels={['task','story'].map(e => ({
  key: e, title: e === 'task' ? 'Tasks' : 'Stories',
  overall: chars.find(c => c.entity === e && c.ordinal === null),
  columns: chars.filter(c => c.entity === e && c.ordinal !== null),
}))} />
```

Panel head reads "median 29 chars · 418 tasks".
