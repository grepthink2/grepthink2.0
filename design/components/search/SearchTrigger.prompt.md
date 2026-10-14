`SearchTrigger` is the header button that opens the global ⌘K palette (replaces the header's fake search input). `SearchField` is the one inline filter input every list/table uses (roster, member manager, project assign, conversation list).

```jsx
<SearchTrigger onOpen={() => setOpen(true)} />
<SearchTrigger iconOnly onOpen={open} />            // phone header
<SearchField value={q} onChange={setQ} placeholder="Search by name or email…" />
```

Props: trigger `label`, `iconOnly`; field `size` (`sm`|`md`), `fullWidth`, `disabled`, `onClear`.
