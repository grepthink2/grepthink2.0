The one loading indicator: a small turning ring in the current text colour, for an action in flight or a small region whose shape is unknown.

## Use

```jsx
<Spinner label="Loading members" />
<Spinner size={24} label="Loading analytics" />
<Spinner size={16} decorative />
```

## Props that matter

- `size`, default 16: 14 in small buttons, 16 in buttons and rows, 20 in cards, 24 for a page region.
- `label`, default "Loading": what a screen reader hears, from a status region.
- `decorative`: the ring alone, hidden from screen readers, beside words that already say it ("Loading more…").

It turns every 0.7s, and keeps turning, slower, under reduced motion. It takes the colour of the text around it.

## The consumer supplies

- A label that says what is loading, or words beside a decorative one.

## Do and don't

- Do let a busy Button show its own spinner: pass it `loading` and `loadingLabel`.
- Do use a Skeleton instead when the layout of the coming content is known.
- Don't cover a page that could render as Skeletons with one large spinner.
