Multi-line text field in the FieldShell. Native `<textarea>`; help, error and counter linked by `aria-describedby`.

```jsx
<Textarea label="What went well?" value={v} onChange={(e) => setV(e.target.value)} maxLength={500} />
<Textarea label="Note" optional rows={2} maxLength={500} error={v.length > 500 ? `Shorten this by ${v.length - 500} characters.` : undefined} />
```

Counter — the one pattern for the app's five: "128 / 500" in tertiary, tabular figures, right of the help line. Past the limit typing is allowed (as the message composer does): counter and border turn red, a polite live region says "12 characters over the limit", and the form blocks the save with the field error "Shorten this by 12 characters." The live region also speaks at 20 left and at the limit — never per keystroke. The native `maxlength` is not set, so pasted text is never silently cut.
