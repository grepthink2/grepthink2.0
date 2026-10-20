Explanations behind an ⓘ — promoted from analytics' DefinitionPopover. WAI-ARIA: a disclosure button (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`) opening a non-modal dialog labelled by its title.

```jsx
<InfoPopover title="How TSRs are counted" label="About TSRs submitted" body="Submitted reports this sprint, out of everyone enrolled. Late submissions count." />
<span className="row"><Button disabled>Publish</Button><InfoPopover title="Why can't I publish?" body="Add at least one question first." /></span>
```

- Trigger: 24px circle (44 on phones), tertiary ⓘ, sunken fill on hover / open, tight focus ring. Opens on click, Enter or Space; Esc closes (captured and stopped, so a popover inside a Modal closes alone) and returns focus to the ⓘ; outside click closes. Focus is never trapped — Tab continues into "Learn more".
- Panel: the shared Popover surface, 352px wide (a 320px text column in 16px padding), title caption/600, body 12.5 secondary; nudged to stay 8px inside the viewport, centred when the viewport is narrower.
- **Tooltip or InfoPopover**: Tooltip is a short one-line label on hover / focus (icon-button names). Anything that explains — what a metric counts, why a control is disabled — is an InfoPopover. It replaces the app's StatTooltip (9 uses) and GroupTooltip (2), which only a mouse could open.
- Disabled controls can't take focus, so a `title` on them is unreachable: put the reason in helper text under the control, or an InfoPopover beside it.
