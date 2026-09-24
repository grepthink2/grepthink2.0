Landing hero: eyebrow pill, two-line display headline (second line in the green clip-text gradient), lede, green CTA with glow shadow + text sign-in link, and a `decor` layer for FloatingCards. Marketing only — the signed-in app never uses gradients.

```jsx
<Hero
  announcement={<AnnouncementPill href="#scrum-board">Scrum boards and team channels</AnnouncementPill>}
  title="Build better project teams,"
  titleAccent="all in one place"
  subtitle="grepthink helps instructors and student teams form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos."
  decor={<FloatingCards />}
/>
```

With the announcement off, pass `eyebrow="For instructors and student teams"` and the original subtitle instead. Props: `ctaLabel/ctaHref/onCta`, `signInLabel/signInHref/onSignIn`, `compact`.
