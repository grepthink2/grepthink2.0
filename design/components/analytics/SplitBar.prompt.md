Team channels vs direct messages as one horizontal split bar (slots 1–2, 2px white gaps) with a counted legend. Not a pie.

```jsx
<SplitBar segments={[
  { key: 'team', label: 'Team channels', value: 572 },
  { key: 'dm', label: 'Direct', value: 712, note: 'school-wide' },
]} mixedScope={!!classId} />
```

With `mixedScope` (a class is selected, so direct stays school-wide while team channels narrow) the bar gives way to two stat lines — proportions would mislead.
