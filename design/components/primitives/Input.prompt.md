Labelled text input with helper text, error state and optional icon/suffix slots. Focus shows the 2px accent-blue ring.

```jsx
<Input label="Project name" value={name} onChange={e => setName(e.target.value)} required />
<Input label="Email" type="email" error="Must be a @ucsc.edu address" iconLeft={<Mail size={16} />} />
```

Props: `label`, `helperText`, `error`, `disabled`, `required`, `iconLeft`, `suffix`.
