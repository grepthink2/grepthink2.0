Chip for a picked value — skills, Combobox chips, applied filters. Radius 7, caption 500, neutral / green / blue fills; long text truncates.

```jsx
<Tag>React</Tag>
<Tag tone="green" onRemove={() => drop('react')} removeLabel="Remove React">React</Tag>
```

The × is a `<button>` named "Remove {name}", in the tab order, with the tight focus ring — never a clickable `<span>` (one tag in the app is). On phones the × keeps its 18px look but gets a 44px hit area (the one hidden hit area in the kit: a chip can't grow to 44px). In a Combobox, Backspace in the empty input also removes the last chip.
