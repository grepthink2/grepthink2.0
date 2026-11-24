A person's name as the link to their page (`/app/people/<id>`), in the colour of the text around it.

## Use

```jsx
<PersonLink person={maya} />
<PersonLink person={maya} variant="inline" />
<PersonLink person={maya} card={lines} />
```

## Props that matter

- `person`: `{ id, name, image_url? }`. The name is the link's text; children replace it.
- `variant`, default `plain`: for a table cell, a list row or a heading, underlined on hover and focus. `inline` is for a name inside a sentence ("Saved Nov 18 by Maya Chen") and keeps a quiet underline at rest, so the link is not told apart by colour alone.
- `card`: `{ roleLine?, teamLine? }`. With it, a mouse pointer that rests on the name opens a PersonHoverCard. Never on touch and never on keyboard focus: there the link goes straight to the page, which shows the same and more.
- `to`: another address, when the person's page is not where the name should lead.

The link never takes the accent blue: it reads as part of its row or sentence.

## The consumer supplies

- The person's id and the name the row already shows.
- For a card, the two lines, from data the row already holds: the card never fetches. A list that does not hold a role or a team passes no `card`.

## Do and don't

- Do use a PersonLink wherever a person's name could lead to them: a roster row, a team's member list, a message header, a "saved by" line.
- Do use `inline` inside running text and `plain` everywhere else.
- Don't give a card to a name that already sits inside a hover panel: a hover inside a hover is hard to hold.
- Don't link a name to a page its reader cannot open, such as someone they no longer share a class with: show plain text.

## PersonHoverCard

The small card a resting pointer opens: a 48px Avatar, the name, one line for the person's role in the class the viewer shares with them, one for their team, and "View profile". It shows only what the row it opens from already showed.

```jsx
<PersonHoverCard person={maya} roleLine="Student · CSE 115A" teamLine="Trailhead · Product Owner" />
```

- `roleLine` and `teamLine`: each is left out when empty.
- The card opens after `HOVER_OPEN_MS` (150 ms) and closes `HOVER_CLOSE_MS` (300 ms) after the pointer leaves the name and the card, so the pointer can cross the gap between them. Esc, or following the link, closes it at once.
