Public landing header for grepthink2.com — a full-width dark (`--gt-mkt-dark`) bar that collapses into a centered translucent pill after 64px of scroll. Marketing pages only.

```jsx
<LandingHeader logoSrc="assets/grepthink-logo.svg" ctaHref="/select" onWhatsNew={openWhatsNew} whatsNewUnseen={unseen} />
<LandingHeader logoSrc={logo} scrolled fixed={false} />   // pill state, in-flow preview
```

Props: `links` (text links; `hideOnPhone` on Features), `signInHref/Label`, `ctaHref/Label`, `onWhatsNew` + `whatsNewUnseen`, `scrolled` (controlled morph), `fixed`, `scrollThreshold`. Morph easing is the bespoke `--gt-mkt-morph` 0.38s cubic-bezier.

**The "ⓘ What's new" tab** (`WhatsNewTab`, 2026-10-23 — the code's `WhatsNewTab.tsx`): a `<button>` in the link's clothes between Features and Contact, the lucide `Info` icon + the label, `aria-haspopup="dialog"`; Enter or Space opens the modal (`Modal tone="dark"`), and the modal gives focus back to it. Both header states carry it; the modal locks the page, so the header never changes state under an open modal.
- **Name never changes**: `aria-label="What's new"`. While a release is unread the NewDot sits on the icon's corner (its ring re-coloured to `--gt-mkt-dark` from `.gt-landing-header__tab-icon`) and the button is also described as "New release notes" (`aria-describedby` → a visually hidden span).
- **Phones**: at ≤ 560px Features hides (`.gt-landing-header__link--features`, the code's rule: "the nav keeps its three essentials") and the tab becomes the nav's first item before Contact, Sign in and Get started. At ≤ 400px the nav text is 11px and **the tab shows the icon alone** (`.gt-landing-header__tab-text` hidden; the name stays). At ≤ 360px the logo drops to 24px and the buttons tighten so the row fits 320px with no horizontal scroll.
- **Touch target**: the visible tab keeps the links' ~30px height; a centred 44×44 hit area (`::after`) reaches past its edge. The other items keep their size.
