Day heading for a schedule group — "Today · Tue, Oct 20", "Tomorrow · Wed, Oct 21", "Thursday · Oct 22". Sticky inside the agenda (`.gt-sched--agenda`), plain in the compact card ("Next · Monday, Oct 26" when today is empty).

```jsx
<ScheduleDayHeader dayKey="2026-10-20" now={now} zone={zone} id="day-2026-10-20" />
<ScheduleDayHeader title="Next" date="Monday, Oct 26" />
```
