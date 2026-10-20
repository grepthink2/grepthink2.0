"How this is counted" popover for a chart-card header — analytics' name for the shared **InfoPopover** (`components/display/InfoPopover.jsx`, promoted in the alignment round). Same props; `title` defaults to "How this is counted".

```jsx
<DefinitionPopover body="Messages sent in team-member channels of the teams in view, plus direct messages between two people of the school, in the selected range." />
```

Port: render `InfoPopover` from `frontend/src/components/InfoPopover/`; the `.gt-definition*` block left `analytics.css`.
