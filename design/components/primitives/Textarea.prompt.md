Multi-line text field for descriptions, TSR feedback and notes. Optional live character counter.

```jsx
<Textarea label="What went well?" value={v} onChange={e => setV(e.target.value)} rows={5} maxLength={500} showCount />
```

Props: `rows`, `helperText`, `error`, `maxLength`, `showCount`, `disabled`, `required`.
