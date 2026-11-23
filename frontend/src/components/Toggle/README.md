An on/off switch for a setting that takes effect the moment it is flipped, such as an email or notification preference.

## Use

```jsx
<Toggle
  label="Email me when a TSR is due"
  description="Sent the day before, at 9 AM."
  checked={dueReminder}
  onChange={(e) => setDueReminder(e.target.checked)}
/>
<Toggle label="Weekly digest" checked={digest} onChange={(e) => setDigest(e.target.checked)} />
```

## Props that matter

- `label`: the setting's name. `description`: a muted second line; with one, the track aligns to the label's first line.
- `checked` with `onChange` (the native change event, read `e.target.checked`), or `defaultChecked` for an uncontrolled switch.
- `disabled`: dims the row; say why in the description.
- Other input props reach the native checkbox, which carries `role="switch"`.

The track is green when on. The native input covers the row, so the whole row toggles it, and on phones the row is at least 44px tall.

## The consumer supplies

- The label, and the save that runs on change. Flip the switch at once and, if the save fails, flip it back and say so in a Toast: a switch never waits for a Save button.

## Do and don't

- Do use a Toggle only where the change applies immediately.
- Don't put a Toggle in a form with a Save button: a choice saved with a form is a Checkbox.
- Don't use a Toggle to choose between two named options ("Weekly / Daily"): that is a RadioGroup or a SegmentedControl.
