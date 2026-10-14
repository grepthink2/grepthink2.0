Compact pager for the palette footer ("1–8 of 37 · ‹ 1 / 5 ›"). Renders nothing when there are no results. ← → in the input also page when the caret is at the edge of the text.

```jsx
<SearchPagination {...paginate(ranked, page, 8)} onChange={setPage} />
```
