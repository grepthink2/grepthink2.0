Flags a task that has sat in a column with no repository activity. Amber "Stalled" label, key + title, evidence ("In Progress for 6 days · no commits"), and a nudge action.

```jsx
<StalledFlag taskKey="GT-9" title="Attendance tab" days={6} detail="no commits" assignee="Sam" onNudge={nudge} />
```

Wording: state facts (days, commits), never blame.
