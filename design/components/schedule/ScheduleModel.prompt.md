Pure schedule model — no UI. Kinds (`SCHEDULE_KINDS`), zone-aware day keys, status (`upcoming | live | past | cancelled | tbd`), the 10-minute Join window, grouping by day, overlap detection, the Now-line index and the formatters every schedule component shares. Ports to `features/schedule/scheduleModel.ts`.

```js
const now = useNow();                                   // ticks every 30s
const zone = viewerZone();                              // 'America/Los_Angeles' on campus
const days = groupByDay(items, { zone, now });          // [{ key, isToday, dividers, items }]
const overlaps = findOverlaps(items);                   // Map id → overlapping items
statusOf(item, now, zone)   // 'live'
isJoinable(item, now)       // true from 10 min before start until the end
countdown(review, now)      // 'in 3 days' (< 7 days away), else null
fmtTimeRange(item, zone)        // '3:00 – 3:45 PM'   fmtDuration(item) // '45 min'   isoDuration(item) // 'PT45M'
fmtDayLabel('2026-10-20', now, zone)  // { title: 'Today', date: 'Tue, Oct 20' }
fmtWeekLabel(weekKeys('2026-10-20'), now, zone) // { title: 'This week', range: 'Oct 19 – 25' }
zoneDiffers(zone, SCHOOL_ZONE) && `Times in ${zoneLabel(zone)}`
```
