Inline add / edit form for one team meeting: Title (≤ 80, counter), Date · Start time (15-min steps) · Duration (default 1 h), Room · Zoom link, Note (≤ 500, counter). Times are typed on the viewer's clock; "3:00 PM PT on campus" appears under the time when zones differ. Validates on submit (first problem gets focus), Esc cancels without closing the host modal, a save `error` shows inline and keeps the draft. Sits on the muted surface, like the schedule's expanded MeetingCard.

```jsx
<TeamMeetingForm mode="create" now={now} zone="Asia/Kolkata" saving={busy} error={saveError}
  onSubmit={(value) => api.createTeamMeeting(projectId, value)} onCancel={close} />
<TeamMeetingForm mode="edit" meeting={meeting} onSubmit={(value) => api.updateTeamMeeting(meeting.id, value)} onCancel={close} />
```
