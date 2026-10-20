The app's container. Five recipes cover its ~55 card surfaces:

```jsx
<Card title="Team" subtitle="5 members" actions={<IconButton ariaLabel="Manage team"><Settings size={16} /></IconButton>}>…</Card>
<Card bordered title="Ana Ruiz" subtitle="Product Owner">…</Card>                 {/* member, request, TA, slot rows */}
<Card shadow="hairline" padded={false}>…</Card>                                     {/* metric / chart surfaces */}
<Card href={`/app/projects/${p.id}`} title={p.name} subtitle={p.team}>…</Card>      {/* project card */}
<Card onClick={() => pick(c.id)} selected={c.id === picked} title={c.code}>…</Card> {/* class card */}
```

- **card**: 10px radius, the 2.61px signature shadow. **hairline**: 1px `--gt-border` + whisper shadow. **bordered**: 1px border, no shadow, radius 7, 12×14 padding, 14px title — for anything nested in a card or a list.
- **Interactive** (`href` / `onClick`): the title is the real link or button, stretched over the card with `::after`, so the whole card is the target and a screen reader hears one name; header `actions` and the `footer` sit above the stretch and stay separately clickable. Hover → `--gt-shadow-hover` (bordered: `--gt-border-strong`), focus → the global ring on the card, `selected` → 2px inset green outline (+ `aria-pressed` for buttons). No lift, no scale.
- Never put a second link or button in the body of an interactive card; put actions in `actions` or `footer`.
- `title` names visible heading content and is never forwarded to the DOM (see NOTES on prop names).
