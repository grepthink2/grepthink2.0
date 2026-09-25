Checkbox with label and optional description; supports indeterminate ("select all") state.

```jsx
<Checkbox label="Notify my team" checked={v} onChange={e => setV(e.target.checked)} />
<Checkbox label="Select all" indeterminate checked={false} onChange={toggleAll} />
```
