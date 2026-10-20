Checkbox with label and optional description; indeterminate for "select all". WAI-ARIA: Checkbox pattern on a native `<input type="checkbox">` (Space toggles).

```jsx
<Checkbox label="Notify my team" description="Members get an email when this posts" checked={v} onChange={(e) => setV(e.target.checked)} />
<Checkbox label="Select all" indeterminate checked={false} onChange={toggleAll} />
```

- The hidden native input covers the whole label row (the label is `position: relative`), so the click target, the tap target and the screen-reader cursor are the visible row. 44px rows on phones.
- The name is the label only; the description is linked with `aria-describedby`.
- Box: 18px, 1.5px `--gt-border-control` (3.7:1), green fill + white check when checked, accent ring on keyboard focus. Disabled 0.45.
- A setting that applies immediately is a Toggle; a choice that is saved with a form is a Checkbox.
