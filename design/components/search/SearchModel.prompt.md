Pure model behind the ⌘K palette — entity order, ranking, pagination with group labels, and the route each entity opens. No UI; port to `features/search/searchModel.ts`.

```jsx
const ranked = rankResults(items, query, { scope, recentIds });
const page = paginate(ranked, 2, 8);          // rows with group labels at type boundaries
navigate(routeFor(item, { role }));
```

Ranking: match quality (exact key 100 → substring 60 → keyword 40) dominates; entity weight (tasks → stories → people → chats → projects → teams → classes → assignments) breaks ties; then per-type tie-breaks (open before done, soonest due, smaller estimate; unread chats first; same-team people first).
