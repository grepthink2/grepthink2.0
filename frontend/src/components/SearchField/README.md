The search box that filters a list or a table in place, with a clear button while it holds text.

## Use

```jsx
<SearchField label="Search classmates" placeholder="Search by name or email…" value={query} onChange={setQuery} />
<SearchField label="Search projects" compact value={projects} onChange={setProjects} />
```

## Props that matter

- `label`, default "Search": the box's name, visually hidden. Name what is searched ("Search classmates").
- `value` with `onChange`, which receives the new string (not the event), or `defaultValue` for an uncontrolled box.
- `placeholder`, default "Search…".
- `onClear`: called by the × ("Clear search"). Without it, the × calls `onChange('')`. Either way focus goes back to the box.
- `compact`: 32px tall instead of 36px, for a toolbar. 44px on phones.
- `fullWidth`: drops the 320px cap on its width.
- `disabled`; other input props reach the `<input type="search">`.

The box sits in a `role="search"` landmark, with a search glyph on the left. The × shows only while there is text; in most browsers Esc clears it too.

## The consumer supplies

- The label, the query state, and the filtering. Debounce a search that calls the server; this field is presentational.
- What the list shows when nothing matches (an EmptyState).

## Do and don't

- Do put it above the list it filters, at the start of the toolbar.
- Don't use it for a form field that is not a search: that is an Input.
- Don't make the placeholder the only label of what is searched.
