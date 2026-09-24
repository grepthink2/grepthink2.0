# GrepThink Site UI Kit — grepthink2.com

Recreation of the public landing page and contact page, composed from `components/marketing/`
and `components/assistant/` (`window.GrepThinkDesignSystem_36e7e3`).

- `index.html` — the landing page: fixed header (bar → pill on scroll), hero with the NEW
  announcement pill + floating cards, Solutions (three columns + preview window), three spotlight
  bands (Scrum board · Messaging · Project assistant preview) with reveal / float / one moment each,
  dark closing band, footer with the new anchors. `CONFIG` at the top of `Landing.jsx` mirrors
  `landing.config.ts` (announcement on/off, band badges).
- `Landing.jsx` — page + `useInView` (IntersectionObserver: `seen` latches once, `visible` tracks
  live) + `Band` (reveal at 30% → settle → moment at 50% + 0.4s, once).
- `Stages.jsx` — `ScrumStage`, `MessagingStage`, `AssistantStage`: decorative, aria-hidden widget
  clusters in `StageCard` shells wrapping design-system anatomy. Moments are CSS keyframes keyed
  off `.is-playing` (see `index.html`), final frame under reduced motion.
- `contact.html` — header + `ContactCard` (idle → sending → success) + footer.
- `preview-frame.html` — 1512×797 source for `assets/landing/landing-preview.*` (Solutions preview).
- `og-image.html` — 1200×630 source for `assets/landing/og-image.png`.

Fictional data only: project ShoeShopper; tasks GT-7…GT-16; people Priya Shah, Jordan L., Sam, Alex.
