import React from 'react';

/**
 * Public landing header (grepthink2.com). Full-width dark bar that morphs
 * into a centered translucent pill once the page scrolls past 64px.
 * Pass `scrolled` to control the morph, or leave it undefined to let the
 * component track window scroll itself. `fixed={false}` renders in-flow
 * (galleries, previews).
 */
export function LandingHeader({
  logoSrc,
  homeHref = '/',
  links = [{ label: 'Features', href: '#scrum-board' }, { label: 'Contact', href: '/contact' }],
  signInHref = '/login',
  signInLabel = 'Sign in',
  ctaHref = '/select',
  ctaLabel = 'Get started',
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

  return (
    <header className={cls}>
      <div className="gt-landing-header__inner">
        <a href={homeHref} className="gt-landing-header__logo" aria-label="grepthink home">
          {logoSrc ? <img src={logoSrc} alt="grepthink" /> : <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '0.02em' }}>grepthink</span>}
        </a>
        <nav className="gt-landing-header__nav" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="gt-landing-header__link">{l.label}</a>
          ))}
          <a href={signInHref} className="gt-landing-header__btn gt-landing-header__btn--ghost">{signInLabel}</a>
          <a href={ctaHref} className="gt-landing-header__btn gt-landing-header__btn--primary">{ctaLabel}</a>
        </nav>
      </div>
    </header>
  );
}
