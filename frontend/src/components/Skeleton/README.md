A grey shimmering placeholder in the shape of content that is still loading, so the layout does not jump when it arrives.

## Use

```jsx
<Skeleton circle height={36} />
<Skeleton width="80%" height={12} />
<Skeleton height={96} radius={10} />
```

## Props that matter

- `width`, default `100%`, and `height`, default `1em`: numbers are px, strings any CSS length.
- `radius`: the corner radius.
- `circle`: a circle as wide as it is tall (an avatar's place); its size is `height`.
- `className` and `style`.

Each Skeleton is hidden from screen readers. Mark the region that is loading with `aria-busy="true"`.

## The consumer supplies

- The shapes: lines as wide as the text that will come, a circle where an avatar goes. And `aria-busy` on the region.

## Do and don't

- Do use Skeletons when the shape of what is coming is known (lists, cards, tables, tiles).
- Do use a Spinner instead for an action in flight, or a small region whose shape is unknown.
- Don't show a Skeleton and a Spinner for the same region.
- Don't use a Skeleton for a kit Table: pass the Table `loading`.

## TableSkeleton

A feature's list table while it loads: the title, the real column headers and shimmering rows, drawn with that feature's own block classes (`roster-list`, `assignment-list`), so it takes the loaded table's place without a jump. It has no look of its own: the preview styles a stand-in block, `ds-list`.

```jsx
<TableSkeleton block="ds-list" title="Students" headers={['Name', 'Email', 'Team']} rows={3} cellWidths={['60%', '80%', '40%']} />
```

- `block`: the feature's BEM root. `title`, `headers`, `rows` (default 8) and `cellWidths` (each column's bar, default 70%).
