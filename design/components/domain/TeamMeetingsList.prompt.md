A team's one-off meetings. `variant="manage"` is the Edit Project → Meetings tab (Product Owner only): upcoming first, "Past (n)" collapsed, each row with title · "Tue, Oct 20 · 3:00 – 4:00 PM" · duration · room / Zoom · one-line note · Edit · Delete; "Add meeting" opens `TeamMeetingForm` above the list, Edit replaces the row with it, Delete confirms inline ("Delete 'Sprint 3 planning'? It disappears from your team's calendars."). `variant="card"` is the project-page card body for every member: upcoming meetings as compact `ScheduleItem` rows (kind meeting) grouped by day, "Past meetings (n)" collapsed, a quiet "Add one" line for the Product Owner when empty (`showTeamMeetingsCard()` says whether to render the card at all).

```jsx
<TeamMeetingsList variant="manage" meetings={meetings} canManage now={now} zone={viewerZone}
  onCreate={(v) => api.createTeamMeeting(projectId, v)} onUpdate={(id, v) => api.updateTeamMeeting(id, v)}
  onDelete={(id) => api.deleteTeamMeeting(id)} />

<TeamMeetingsList variant="card" meetings={meetings} teamName="Team 1" people={membersById}
  canManage={isProductOwner} onManage={() => openEditProject('meetings')} onJoin={track} />
```

Shared parts (rebuilt 2026-10-20): row actions are `Button` ghost (Edit) and danger-ghost (Delete); a delete confirms with the shared `InlineConfirm` in the row's slot; the manage view's load error is an error `Alert` with an outline **Try again**. The past toggle and the card's quiet text links stay team-meetings markup.
