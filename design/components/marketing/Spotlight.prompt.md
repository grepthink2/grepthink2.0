One full-width feature band for the landing page: eyebrow (with NEW/SOON badge), heading with a gradient-accent tail, lead, bullets with green icon tiles, optional staff note and link — and a `<Stage>` of floating widgets on the other side. Bands alternate `side` and `alt` background.

```jsx
<Spotlight id="scrum-board" eyebrow="Scrum board" badge="NEW"
  heading="Run every sprint from" headingAccent="one board"
  lead="Break your project into sprints, user stories and tasks…"
  bullets={[{ icon: <Move />, text: 'Drag-and-drop board with a history of every move' }]}
  side="right" hairline>
  <Stage>…StageCards…</Stage>
</Spotlight>
<Spotlight id="project-assistant" eyebrow="Project assistant" badge="SOON" tone="amber"
  note={{ title: 'For TAs and instructors', text: '…' }} link={{ label: 'Want early access? Get in touch', href: '/contact' }}>
  <Stage variant="preview">…</Stage>
</Spotlight>
```

Layout: 1100px max, `1fr 1.08fr` columns (stage wider), 48px gap, `clamp(72px, 9vw, 112px)` vertical padding, `scroll-margin-top` 88px under the fixed header; stacks below 1080px (text first). The band link is `#016547` (`--gt-mkt-band-link`).
