The one filter row (`.gt-filter`) for the Analytics page: class Select ("All classes" first, labels "CSE 115A · Fall 2026"), range chips 7d · 30d · 90d · Class to date · All, and a Custom chip that opens a From/To popover with Apply. Institution Select appears only when the viewer can see several.

```jsx
<AnalyticsFilterRow classes={[{id:'c1',label:'CSE 115A · Fall 2026'}]} classId={classId}
  range={{ preset: '30d' }} onChange={v => setSearchParams(v)} disabled={firstLoad} />
```

"Class to date" is disabled without a class; the active chip is solid green (`--active` + `aria-pressed`); an applied custom range reads "Custom: Sep 1 – Sep 30"; everything is disabled during the very first load. Never put a filter inside a card.
