Radio group for one-of-N choices (visibility, team preference type).

```jsx
<RadioGroup legend="Project visibility" value={v} onChange={setV}
  options={[{value:'open',label:'Open',description:'Anyone can request to join'},
            {value:'invite',label:'Invite only'}]} />
```

Props: `legend`, `options` (with `description`, `disabled`), `inline`.
