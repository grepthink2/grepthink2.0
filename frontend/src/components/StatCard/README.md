A metric card: one figure with its label, and optionally an icon, a change against an earlier period, a small trend line and an explanation.

## Use

```jsx
<StatCard
  label="Registered Students"
  value={62}
  hint="58 enrolled · 4 invited"
  icon={<Users size={16} />}
  info={{ body: 'Students registered in GrepThink' }}
/>
<StatCard
  compact
  format="compact"
  label="Messages"
  value={12900}
  icon={<MessageSquare size={16} />}
  accent="blue"
  trend={WEEKLY}
  delta={{ value: 0.18, vsLabel: 'vs the 7 days before' }}
/>
<StatCard label="Students" value={null} hint="Appears once the roster is imported" />
```

## Props that matter

- `label` (shown in capitals) and `value`: a number, a preformatted string, or `null` for unknown, shown as "—".
- `format`, default `raw`: `compact` (12.9K, 1.3M) or `percent` (0.82 shows 82%).
- `hint`: the muted line under the value: what it counts, or why it is "—".
- `icon`: a 16px lucide icon in a tinted chip; `accent`, default `primary`, tints it (`blue`, `purple`, `amber`).
- `delta`: `{ value, vsLabel, goodWhenUp }`. A ratio (0.18 is "+18%"), green when the change is good and red when bad; `goodWhenUp: false` flips that, for a figure where less is better. `value: null` hides it.
- `trend`: 2 to 12 weekly points, complete weeks only, drawn as a small grey line ending in a green dot.
- `info`: `{ body, title?, learnMoreHref? }` puts an InfoPopover ⓘ beside the label.
- `failed`: "—" and "Could not load". `loading`: a skeleton in place of the value, and the card marked busy.
- `compact`: the denser analytics tile.
- `onClick`: the whole card becomes one button named "{label}: {value}"; the ⓘ stays its own button.

## The consumer supplies

- The label, the figure, and the hint that explains an empty one. Compute the delta and the trend; the card only draws them.

## Do and don't

- Do explain a figure people may misread with `info`, not with a tooltip only a mouse can open.
- Do show "—" with a hint when there is no data yet, never a misleading 0.
- Don't pass partial weeks to `trend`.
