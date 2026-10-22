Metric card — **one component** for the Dashboard (`DashboardMetricCard`, 4 uses) and the analytics tiles (6 uses, `<StatCard compact format="compact">`; the StatTile alias left 2026-10-22).

```jsx
<StatCard label="Registered Students" value={62} hint="58 enrolled · 4 invited" icon={<Users size={16} />}
  info={{ body: 'Students registered in GrepThink' }} />
<StatCard compact format="compact" label="Messages" value={12900} trend={weekly}
  delta={{ value: 0.18, vsLabel: 'vs the 7 days before' }} />
<StatCard label="Students" value={null} hint="Appears once the roster is imported" />
```

- Label 12px/600 uppercase tertiary; value 2rem/600 (compact: h2); hint caption tertiary; 30px icon chip tinted per `accent` (primary / blue / purple / amber — tokens only).
- `delta`: trending icon + signed % + "vs …", green when good, red when bad (`goodWhenUp: false` flips it), tertiary when flat. `trend`: 84×24 sparkline, grey history, green last point with a white ring; complete weeks only.
- `info` puts an InfoPopover ⓘ beside the label (click / Enter opens, Esc closes) — the Dashboard's tooltips only a mouse could open become this. Today only **Registered Students** has an explanation ("Students registered in GrepThink", the port's answer 2026-10-20); the other Dashboard tiles carry no ⓘ.
- `failed` / null → "—" (+ "Could not load"); `loading` → a 64×22 skeleton and `aria-busy`.
- `onClick`: a stretched button under the content, named "{label}: {value}", with hover shadow and the focus ring; the ⓘ sits above it and stays separately focusable.
