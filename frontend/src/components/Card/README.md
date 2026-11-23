The app's white surface for a block of content, with an optional title, actions and footer, and a whole-card link or button when the card opens something.

## Use

```jsx
<Card
  title="Team"
  subtitle="2 members"
  actions={<IconButton ariaLabel="Manage team" size="sm"><Settings size={16} /></IconButton>}
  footer={<Button variant="ghost" size="sm">View all</Button>}
>
  …
</Card>
<Card bordered title="Maya Chen" subtitle="Product Owner">maya.chen@example.edu</Card>
```

A card that is one target, here a button that selects it:

```jsx
<Card key={c.id} onClick={() => setPicked(c.id)} selected={c.id === picked} title={c.code} subtitle={c.term}>
  {c.students} students
</Card>
```

## Props that matter

- `title` (a heading, `h3` unless `titleAs` says `h2`, `h4` or `p`) and `subtitle`; or a custom `header`. `title` is never the HTML attribute.
- `actions`: the header's right side (IconButtons, a Menu trigger, a small Button).
- `footer`: a row under a hairline.
- `shadow`, default `card` (the app's soft shadow): `hairline` (a 1px border and a whisper of shadow) or `none`.
- `bordered`: a 1px border, no shadow, a 7px radius and tighter padding, for a card inside a card or a list (member, request and slot rows).
- `padded`, default `true`: `false` lets a chart or a Table run to the card's edges.
- `onClick`, `to` (an in-app route) or `href` (another site) make the card interactive: its title becomes the real button or link, stretched over the whole card, so the card is one target with one name. Such a card needs a `title`.
- `selected`: a green border; `aria-pressed` on a button card, `aria-current` on a link card.

The card never clips its content, so a tooltip or a menu opened from its actions shows in full.

## The consumer supplies

- The title and content, and for an interactive card its one action.

## Do and don't

- Do use `bordered` for cards nested in a card or listed in a column.
- Don't put a second link or button in the body of an interactive card: put it in `actions` or the `footer`, which stay their own targets.
- Don't wrap a Card in your own link or click handler: pass `to`, `href` or `onClick`.
