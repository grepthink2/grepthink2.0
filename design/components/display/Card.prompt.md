The app's container. Five recipes cover its ~55 card surfaces:

```jsx
<Card title="Team" subtitle="5 members" actions={<IconButton ariaLabel="Manage team"><Settings size={16} /></IconButton>}>…</Card>
<Card bordered title="Ana Ruiz" subtitle="Product Owner">…</Card>                 {/* member, request, TA, slot rows */}
<Card shadow="hairline" padded={false}>…</Card>                                     {/* metric / chart surfaces */}
<Card href={`/app/projects/${p.id}`} title={p.name} subtitle={p.team}>…</Card>      {/* project card (an in-app route is `to`) */}
<Card onClick={() => pick(c.id)} selected={c.id === picked} title={c.code}>…</Card> {/* class card */}
```

- **card**: 10px radius, the 2.61px signature shadow. **hairline**: 1px `--gt-border` + whisper shadow. **bordered**: 1px border, no shadow, radius 7, 12×14 padding, 14px title — for anything nested in a card or a list.
- **Interactive** (`href` / `to` / `onClick`): the title is the real link or button, stretched over the card with `::after` (the card's radius; radius-sm when bordered), so the whole card is the target and a screen reader hears one name; header `actions` and the `footer` sit above the stretch and stay separately clickable. Hover → `--gt-shadow-hover` (bordered: `--gt-border-strong`), focus → the global ring on the card (never on the title's text), `selected` → 2px inset green outline (+ `aria-pressed` for buttons, `aria-current="true"` for links). No lift, no scale.
- **No clip.** The card never sets `overflow: hidden`: the Tooltip of an IconButton in `actions`, and any Menu or Popover hung from it, render in place. A flush body (`padded={false}`) clips and rounds its own corners (top when it comes first, bottom when it comes last), and a focused flush child (a scrolling Table region) rings the card.
- Never put a second link or button in the body of an interactive card; put actions in `actions` or `footer`.
- `title` names visible heading content and is never forwarded to the DOM (see NOTES on prop names).
