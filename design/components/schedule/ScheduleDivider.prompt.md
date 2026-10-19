Sprint start/end marker — a dashed rule with an inline muted label at the top of its day ("Sprint 3 starts", "Sprint 2 ends today"). No time, no button, no card.

```jsx
<ScheduleDivider item={{ kind: 'sprint', sprint: { name: 'Sprint 2', edge: 'end' } }} isToday />
<ScheduleDivider sprint={{ name: 'Sprint 3', edge: 'start' }} />
```
