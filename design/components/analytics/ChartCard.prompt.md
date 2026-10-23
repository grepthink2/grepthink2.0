Container for every analytics chart (`.gt-chart-card`) — title + subtitle + ⓘ definition (the kit's `InfoPopover`), optional LIVE pill, header tools, and the five states on `data-state` (loading skeleton on first load only · refetching at 60% with the frame held · ready · empty · error with Retry).

```jsx
<ChartCard title="Conversations" subtitle="Team channels and direct messages." definition="Messages sent in team-member channels…"
  state={loading ? 'loading' : refetching ? 'refetching' : rows.length ? 'ready' : 'empty'}
  emptyMessage={{ icon: 'message-square', title: 'No messages yet', hint: 'Team channels fill in as teams start talking.' }}
  actions={<Button size="sm" variant="outline" pressed={asTable} iconLeft={<AnalyticsIcon name="table" size={13} />} onClick={() => setAsTable(v => !v)}>Table</Button>}
  footnote="1,284 messages · Sep 8 – Oct 7 · direct messages are school-wide" wide>
  <WeeklyLine … />
</ChartCard>
```

- **Header tools are kit components** (2026-10-22): the Table toggle is a `Button` with `pressed`, Refresh and Export CSV are `variant="outline"`, "Compare with previous range" is a `Checkbox`. The card sizes them to 28px from its own class (`.gt-chart-card__actions .gt-button`); the kit's 44px phone rule still wins.
- **Empty** renders the kit's `EmptyState` with `variant="card"` (36px sunken disc, 13px title, hint); `emptyMessage` gives the copy and the lucide icon name.
- Fixed heights, if any, must include the x-axis band — never nest a scroll.
