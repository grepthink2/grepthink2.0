One schedule row (`<li>`): time cell (range + duration, "All day", or "Time TBD"), kind tile (icon + tinted tile; the kind label appears in the context line when the title doesn't carry it), title with Live / countdown / attendance / Cancelled / Overlaps pills, context line, people (host or both reviewers), actions (Join Zoom inside the 10-minute window, quiet Zoom link before it, Mark attendance / Set time for staff), and an agenda-only expand into `MeetingCard`.

```jsx
<ol className="gt-sched__items">
  <ScheduleItem item={taMeeting} variant="agenda" lens="ta" now={now} zone="America/Los_Angeles"
    overlaps={overlaps.get(taMeeting.id) || []} expanded={expandedId === taMeeting.id} onToggle={toggle}
    onMarkAttendance={mark} onJoin={track} />
  <ScheduleItem item={deadline} variant="compact" />
</ol>
```

`ScheduleIcon` is the family's lucide-shaped glyph: `<ScheduleIcon name="video" size={15} />`.
