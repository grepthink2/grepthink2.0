The pager under a long list: previous and next around the page numbers, with a gap where pages are skipped and the current page in solid green.

## Use

```jsx
<Pagination page={page} pageCount={12} onChange={setPage} />
<Pagination page={listPage} pageCount={pageCount} onChange={setListPage} ariaLabel="Student pages" />
```

## Props that matter

- `page` (1-based, default 1) and `pageCount` (default 1).
- `onChange`: called with the page chosen. Pressing the current page, or an arrow past either end, changes nothing.
- `ariaLabel`, default "Pagination": names the navigation landmark ("Student pages").

Up to seven pages it shows every number; past that, the first and last pages, the current one and its neighbours, with "…" between. The current page carries `aria-current="page"`, and each button is named "Page N".

## The consumer supplies

- The page state, and around the pager the "Showing 1–25 of 132" line and any rows-per-page choice: they belong to the screen.

## Do and don't

- Do put it under the list it pages, and reset to page 1 when the search, a filter or the sort changes (usePagination's `resetKey` does it).
- Don't page a short list: up to a page of rows needs no pager.

## usePagination

Client-side paging for a list that is already filtered and sorted:

```js
const { pageRows, page, pageCount, setPage, from, to, total, pageSize, setPageSize } =
  usePagination(rows, { initialPageSize: 25, resetKey: query });
```

`pageRows` are the rows of the current page, and `from`, `to` and `total` make the "Showing 1–25 of 132" line. Changing the page size or `resetKey` goes back to page 1, and a list that shrinks under the current page shows its last page. `PAGE_SIZE_OPTIONS` is 10, 25, 50 and 100, and `pageItems(page, pageCount)` lists the numbers and gaps the pager draws.
