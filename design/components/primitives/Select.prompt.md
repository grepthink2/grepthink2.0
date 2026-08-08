Styled native dropdown for single choice (roles, class term, sort order).

```jsx
<Select label="Role" value={role} onChange={e => setRole(e.target.value)}
  options={[{value:'owner',label:'Owner'},{value:'member',label:'Member'}]} />
```

Props: `options` or `<option>` children, `placeholder`, `helperText`, `error`, `disabled`, `required`.
