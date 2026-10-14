Live scrum snapshot (`.gt-stack`) — horizontal stacked bars, one row per sprint ordinal (Backlog first, labels "Backlog", "Sprint 1"…, "8 teams" meta), colored like the board via `.gt-status--todo / --in_progress / --done`. `unit` swaps tasks ↔ points without recoloring.

```jsx
<StackedBars unit={unit} rows={by_sprint.map(s => ({
  key: String(s.ordinal), label: s.label, teams: s.teams,
  segments: [
    { status: 'todo', count: s.todo, points: s.points_todo },
    { status: 'in_progress', count: s.in_progress, points: s.points_in_progress },
    { status: 'done', count: s.done, points: s.points_done },
  ]}))} />
```

Direct counts live in the row's `__value` column (text tokens, swatch-keyed) — never inside the bars. Legend always shown and toggles; `view="table"` is the twin; > 8 rows ⇒ dense 14px bars + "Show all (n)".
