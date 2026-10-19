Pure model for a team's one-off meetings: upcoming/past split, the `ScheduleItemData` (kind `meeting`) conversion, viewer-clock ↔ instant conversion, the campus-time hint, and form validation (title ≤ 80, date + time required, no past start when creating, Zoom must be an http(s) URL, note ≤ 500). No UI; ports to `features/project/teamMeetingsModel.ts`.

```js
const { splitMeetings, toScheduleItem, validateTeamMeeting, campusTimeOf } = TeamMeetingsModel;
const { upcoming, past } = splitMeetings(meetings, now);
const items = upcoming.map((m) => toScheduleItem(m, { teamName: 'Team 1', people }));
const { valid, errors, value } = validateTeamMeeting(draft, { now, zone: viewerZone, creating: true });
campusTimeOf('2026-10-20', '15:00', 'Asia/Kolkata'); // "2:30 AM PT · Tue"
```
