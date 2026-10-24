Schedule list in two variants. `compact` is the body of the "Today's Schedule" card on Student Home: today's items with a live Now line, or — when today is empty — "Nothing scheduled today", a peek at the next day that has something and an "Add to your calendar" link. `agenda` is the /app/schedule week: ‹ This week › switcher, class select + kind chips, sticky day headers, sprint rules, the Now line on today, TA meetings that expand into `MeetingCard`. Same component for Student, TA and Instructor — `lens` only changes the actions.

```jsx
<ScheduleList variant="compact" items={items} lens="student" calendarHref="/api/calendar.ics" seeAllHref="/app/schedule" />

<ScheduleList variant="agenda" items={items} lens="ta" classes={[{ id: 'c1', label: 'CSE 115B' }, { id: 'c2', label: 'CSE 115A' }]}
  onMarkAttendance={openCheckIn} onSetTime={openZoomModal} onJoin={track} calendarHref="/api/calendar.ics" />

<ScheduleList variant="compact" status="loading" />
<ScheduleList variant="agenda" status="error" onRetry={reload} />
```
