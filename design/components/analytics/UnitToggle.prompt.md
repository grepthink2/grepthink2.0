Tasks | Points segmented control for the scrum snapshot card header. Swaps the measure; never recolors; the two units never share one axis.

```jsx
<UnitToggle value={unit} onChange={setUnit} />
<UnitToggle value={v} onChange={setV} options={[{value:'count',label:'Count'},{value:'rate',label:'Rate'}]} />
```

Arrow keys move the selection; options expose `aria-pressed`.
