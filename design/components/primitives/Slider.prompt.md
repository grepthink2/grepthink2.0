A number picked on a range — first use: each teammate's share on the TSR contributions step (`features/app/components/TSRS/ContributionsTab.tsx`, today a feature-styled native range). WAI-ARIA: Slider pattern on a native `<input type="range">` (role, value and keys come from the browser; PageUp / PageDown are made consistent).

```jsx
<Slider label="Ashton Liu (you)" unit="%" value={share} onChange={setShare} />
<Slider label="Tony Wu" unit="%" withInput color="var(--gt-avatar-2)" value={tony} onChange={setTony} />
<Slider label="Contribution" unit="%" value={v} onChange={setV} error="Contributions add up to 90%. Assign the last 10%." />
```

- **Field shell**: label above (the name; `hideLabel` keeps it for screen readers), help or error under, "(optional)". The error turns fill and thumb `--gt-error` and sets `aria-invalid`; a group-level problem (the TSR total isn't 100%) is one Alert or helper line under the group, not an error on every slider.
- **Look**: 4px track in `--gt-border-control` (3.7:1, the range is visible against white), fill and 20px thumb in `--gt-primary` (or `color`) with a 2px white ring and a small shadow; the thumb grows 1.1× on hover (no motion under reduced motion). Keyboard focus puts the 2px accent ring on the thumb. Disabled: the row at 0.45.
- **Value**: beside the track in 14/600 tabular figures ("25%"), hidden from screen readers because `aria-valuetext` already says it. `withInput` swaps it for a 64px compact number input (named "{label} exact value"); typing an in-range value moves the slider at once, anything else is clamped on blur.
- **Keys**: ← ↓ / → ↑ one `step`; PageDown / PageUp `pageStep` (default a tenth of the range); Home / End the ends.
- **Phones (< 768px)**: the control is 44px tall (the input itself, no hidden hit area); the number input is 44px too.
- Tokens only. Legend colours come from the avatar or chart palette tokens, never hex.
