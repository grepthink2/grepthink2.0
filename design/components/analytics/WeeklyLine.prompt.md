Messages per week, one or two series (team channels green with wash, direct blue). Crosshair snaps to the nearest week; one tooltip lists both; last points are end-labelled; legend toggles isolate a series; `view="table"` renders the table twin.

```jsx
<WeeklyLine height={200} series={[
  { key: 'team', label: 'Team channels', points: weekly.map(w => ({ weekStart: w.week_start, value: w.team_members })) },
  { key: 'dm', label: 'Direct', points: weekly.map(w => ({ weekStart: w.week_start, value: w.dm })) },
]} />
```

Gridlines are hairline and solid; axis labels wear text tokens, never the series color.
