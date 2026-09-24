import React from 'react';
import { Eyebrow } from './Eyebrow.jsx';

/**
 * Landing hero: eyebrow OR announcement pill, two-line display title with
 * gradient accent, lede, CTA + text sign-in, and a `decor` layer behind
 * the copy. Halftone dots + green wash come from the CSS.
 */
export function Hero({
  eyebrow,
  announcement = null,
  title,
  titleAccent,
  subtitle,
  ctaLabel = 'Get started',
  ctaHref = '/select',
  onCta,
  signInLabel = 'Sign in',
  signInHref = '/login',
  onSignIn,
  decor = null,
  compact = false,
  className = '',
}) {
  const CtaTag = onCta ? 'button' : 'a';
  const SignTag = onSignIn ? 'button' : 'a';
  return (
    <section className={['gt-hero', compact ? 'gt-hero--compact' : '', className].filter(Boolean).join(' ')}>
      {decor && <div className="gt-hero__cards" aria-hidden="true">{decor}</div>}
      <div className="gt-hero__content">
        {announcement ? announcement : eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="gt-hero__title">
          {title}
          {titleAccent && (
            <React.Fragment>
              <br />
              <span className="gt-hero__title-accent">{titleAccent}</span>
            </React.Fragment>
          )}
        </h1>
        {subtitle && <p className="gt-hero__subtitle">{subtitle}</p>}
        <div className="gt-hero__actions">
          <CtaTag className="gt-hero__cta" href={onCta ? undefined : ctaHref} onClick={onCta} type={onCta ? 'button' : undefined}>{ctaLabel}</CtaTag>
          <SignTag className="gt-hero__signin" href={onSignIn ? undefined : signInHref} onClick={onSignIn} type={onSignIn ? 'button' : undefined}>
            {signInLabel} <span aria-hidden="true">→</span>
          </SignTag>
        </div>
      </div>
    </section>
  );
}
