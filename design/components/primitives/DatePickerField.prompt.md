Date field with calendar popover (assignment due dates, meeting times). Mirrors the app's `.dpf` component.

```jsx
<DatePickerField label="Due date" value={due} onChange={setDue} />
```

Selected day = solid green; today = green outline. Popover closes on pick or outside click.
