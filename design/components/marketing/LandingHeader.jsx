import React from 'react';
import { NewDot } from '../display/NewDot.jsx';

const InfoGlyph = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;

/**
 * The header's "ⓘ What's new" tab (2026-10-23; the codebase's `features/landing/components/WhatsNewTab.tsx`): a
 * button in the header link's clothes with the lucide Info icon and the label, `aria-haspopup="dialog"`, Enter or
 * Space opens the modal. Its name is always "What's new" (`aria-label`), so at ≤ 400px the label can go and the
 * icon stands alone. While a release is unread the NewDot sits on the icon's corner (its ring re-coloured to the bar's dark from the header's class)
 * and the button is also described as "New release notes" (a visually hidden span). The touch target is 44px
 * through a hit area past the visible edge (`::after`); the visible button keeps the other links' height.
 */
export function WhatsNewTab({ onOpen, unseen = false, label = "What's new", className = '', ...rest }) {
  const descId = React.useId();
  return (
    <button type="button" className={['gt-landing-header__link', 'gt-landing-header__tab', className].filter(Boolean).join(' ')}
      aria-label={label} aria-haspopup="dialog" aria-describedby={unseen ? descId : undefined} onClick={onOpen} {...rest}>
      <span className="gt-landing-header__tab-icon"><InfoGlyph />{unseen && <NewDot ring />}</span>
      <span className="gt-landing-header__tab-text">{label}</span>
      {unseen && <span id={descId} className="gt-visually-hidden">New release notes</span>}
    </button>
  );
}

/**
 * Public landing header (grepthink2.com). Full-width dark bar that morphs
 * into a centered translucent pill once the page scrolls past 64px.
 * Pass `scrolled` to control the morph, or leave it undefined to let the
 * component track window scroll itself. `fixed={false}` renders in-flow
 * (galleries, previews).
 * 2026-10-23: `onWhatsNew` renders the "ⓘ What's new" tab between Features and Contact (`whatsNewUnseen` shows
 * its dot). A link with `hideOnPhone` (Features) hides at ≤ 560px, as the code's `landing-header__link--features`
 * does: phones scroll into the bands anyway, and the nav keeps its three essentials plus the tab, which becomes
 * the nav's first item there.
 */
export function LandingHeader({
  logoSrc,
  homeHref = '/',
  links = [{ label: 'Features', href: '#scrum-board', hideOnPhone: true }, { label: 'Contact', href: '/contact' }],
  signInHref = '/login',
  signInLabel = 'Sign in',
  ctaHref = '/select',
  ctaLabel = 'Get started',
  onWhatsNew,
  whatsNewUnseen = false,
  whatsNewLabel = "What's new",
  scrolled,
  fixed = true,
  scrollThreshold = 64,
  className = '',
}) {
  const [autoScrolled, setAutoScrolled] = React.useState(false);
  const controlled = typeof scrolled === 'boolean';

  React.useEffect(() => {
    if (controlled || !fixed) return undefined;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setAutoScrolled(window.scrollY > scrollThreshold);
        frame = 0;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [controlled, fixed, scrollThreshold]);

  const isScrolled = controlled ? scrolled : autoScrolled;
  const cls = [
    'gt-landing-header',
    isScrolled ? 'gt-landing-header--scrolled' : '',
    fixed ? '' : 'gt-landing-header--static',
    className,
  ].filter(Boolean).join(' ');
  const link = (l) => (
    <a key={l.href} href={l.href} className={['gt-landing-header__link', l.hideOnPhone ? 'gt-landing-header__link--features' : ''].filter(Boolean).join(' ')}>{l.label}</a>
  );
  const splitAt = links.length > 1 ? 1 : 0; // the tab sits between Features and Contact

  return (
    <header className={cls}>
      <div className="gt-landing-header__inner">
        <a href={homeHref} className="gt-landing-header__logo" aria-label="grepthink home">
          {logoSrc ? <img src={logoSrc} alt="grepthink" /> : <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '0.02em' }}>grepthink</span>}
        </a>
        <nav className="gt-landing-header__nav" aria-label="Primary">
          {links.slice(0, splitAt).map(link)}
          {onWhatsNew && <WhatsNewTab onOpen={onWhatsNew} unseen={whatsNewUnseen} label={whatsNewLabel} />}
          {links.slice(splitAt).map(link)}
          <a href={signInHref} className="gt-landing-header__btn gt-landing-header__btn--ghost">{signInLabel}</a>
          <a href={ctaHref} className="gt-landing-header__btn gt-landing-header__btn--primary">{ctaLabel}</a>
        </nav>
      </div>
    </header>
  );
}
