A slot's time — viewer's zone first, the campus time visibly beside it when the zones differ (brief §3.4, never a tooltip).

```jsx
<SlotTime startsAt="2026-12-07T23:00:00Z" zone="Asia/Kolkata" />
// 4:30 – 5:30 AM
// Mon 3:00 PM PT on campus
<SlotTime startsAt={iso} zone={zone} withDay withDuration />   // Monday, Dec 7 · 9:00 – 10:00 AM · 1 h
```
- Every time is `<time datetime="ISO instant">`; the day is `<time datetime="YYYY-MM-DD">`; the duration `<time datetime="PT1H">1 h</time>`.
- 13/500 tabular for the range, 11.5 tertiary for the campus line (`white-space: nowrap`). The campus weekday appears only when the campus day differs.
