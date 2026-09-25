Public landing header for grepthink2.com — a full-width dark (`#0c1f18`) bar that collapses into a centered translucent pill after 64px of scroll. Marketing pages only.

```jsx
<LandingHeader logoSrc="assets/grepthink-logo.svg" ctaHref="/select" />
<LandingHeader logoSrc={logo} scrolled fixed={false} />   // pill state, in-flow preview
```

Props: `links` (text links), `signInHref/Label`, `ctaHref/Label`, `scrolled` (controlled morph), `fixed`, `scrollThreshold`. Morph easing is the bespoke `--gt-mk-morph` 0.38s cubic-bezier.
