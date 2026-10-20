The app's search box for filtering a list or table in place (promoted from `search/`). Native `type="search"` inside `role="search"`, named by a visually hidden label.

```jsx
<SearchField label="Search classmates" placeholder="Search by name or email…" value={q} onChange={setQ} />
<SearchField label="Search projects" compact value={q} onChange={setQ} />
```

36px (32 `compact`, 44 on phones), max 320px unless `fullWidth`. Search glyph left, clear × right ("Clear search", returns focus to the input). Esc clears (native). Debounce in the caller. The ⌘K palette is the CommandPalette, not this.
