Container for every analytics chart (`.gt-chart-card`) — title + subtitle + ⓘ definition, optional LIVE pill, header tools, and the five states on `data-state` (loading skeleton on first load only; refetching holds the frame at 60% opacity; empty; inline error strip "This card could not load." with Retry).

```jsx
<ChartCard title="Conversations" subtitle="Team channels and direct messages."
  definition="Messages sent in team-member channels …"
  state={loading ? 'loading' : refetching ? 'refetching' : rows.length ? 'ready' : 'empty'}
  emptyMessage={{ icon: 'message-square', title: 'No messages yet', hint: 'Team channels fill in as teams start talking.' }}
  actions={<ChartCardTool icon="table" label="Table" pressed={asTable} onClick={() => setAsTable(v => !v)} />}
  footnote="1,284 messages · Sep 8 – Oct 7 · direct messages are school-wide" wide>
  <WeeklyLine … />
</ChartCard>
```

`ChartCardCheck` is the header checkbox ("Compare with previous range"). Fixed heights, if any, must include the x-axis band — never nest a scroll.
