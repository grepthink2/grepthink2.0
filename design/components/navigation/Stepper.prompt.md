The TSR form's steps. Semantics: a `<nav aria-label>` around an `<ol>`; the current step carries `aria-current="step"`. Steps are **buttons**, not links or tabs: the TSR steps live on one route (no URL per step) and are filled in order, so a tablist's free switching would be wrong. Done and error steps are buttons back to that step (`onStepClick`); upcoming steps are plain text and out of the tab order.

```jsx
<Stepper current={1} onStepClick={(id) => goTo(id)}
  steps={[{ id: 'self', label: 'About you' }, { id: 'rate', label: 'Rate teammates' }, { id: 'notes', label: 'Notes' }, { id: 'review', label: 'Review' }]} />
```

- Marker 28px: upcoming = number in a 1.5px `--gt-border-control` ring; current = solid green with a white number; done = green ring + soft fill + **check**; error = red ring + soft fill + **!**. Labels 12.5px: current primary 600, done secondary, upcoming tertiary, error error-text. Connectors 2px, green after a done step.
- State is never colour alone: each label carries visually hidden "Step 2: … , completed / current step / has errors / not started".
- Phones (< 768px): the list collapses to "Step **2** of 4 · **Rate teammates**" over a 4px inline meter (decorative; the sentence carries the number).
