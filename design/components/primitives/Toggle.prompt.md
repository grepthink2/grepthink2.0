On/off switch for settings that take effect at once (Settings → email preferences, notifications). WAI-ARIA: Switch pattern (`role="switch"` on a native checkbox; Space toggles).

```jsx
<Toggle label="Email me when a TSR is due" description="Sent the day before, at 9 AM" checked={v} onChange={(e) => setV(e.target.checked)} />
```

- With a description the track aligns to the first line and the description is linked with `aria-describedby`.
- Track 36×20: off `--gt-border-control` (3.7:1 on white), on `--gt-primary`; white thumb slides 16px (no slide under reduced motion). The native input covers the row; 44px rows on phones.
- Saving: flip the switch at once and roll back with a Toast if the save fails — a switch never waits for a Save button. Choices saved with a form are Checkboxes.
