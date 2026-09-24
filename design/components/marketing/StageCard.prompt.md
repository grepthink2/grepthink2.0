Stage + StageCard: the decorative widget layer of a spotlight band. `Stage` is the backdrop (green tint + dot grid for live features, outlined flat + PREVIEW tag for coming-soon); `StageCard` is the floating shell (white, 20px, two-layer shadow, tilt, float) that wraps design-system anatomy.

```jsx
<Stage>
  <StageCard tilt={-2} floatY={-10} floatDur={8} order={0} title="Sprint 3" meta="4 days left" style={{left: 18, top: 34, width: 360}}>…</StageCard>
  <StageCard tilt={3} floatY={9} order={1} mobile style={{right: 14, top: 196, width: 262}}>…</StageCard>
</Stage>
<Stage variant="preview">…</Stage>
```

Tilt within −3…+3°, float ±8–10px over 8–10s. Mark exactly one card `mobile`; `tabletHide` the ones that crowd 768–1079px.
