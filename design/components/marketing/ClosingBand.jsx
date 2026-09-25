import React from 'react';

/**
 * Dark green closing band before the footer: heading, one line, primary
 * CTA + outlined "Talk to us".
 */
export function ClosingBand({
  heading = 'Ready to run your class on grepthink?',
  text,
  ctaLabel = 'Get started',
  ctaHref = '/select',
  secondaryLabel = 'Talk to us',
  secondaryHref = '/contact',
  className = '',
}) {
  return (
    <section className={['gt-closing', className].filter(Boolean).join(' ')} aria-labelledby="gt-closing-heading">
      <div className="gt-closing__inner">
        <h2 className="gt-closing__heading" id="gt-closing-heading">{heading}</h2>
        {text && <p className="gt-closing__text">{text}</p>}
        <div className="gt-closing__actions">
          <a className="gt-closing__cta" href={ctaHref}>{ctaLabel}</a>
          {secondaryLabel && <a className="gt-closing__ghost" href={secondaryHref}>{secondaryLabel}</a>}
        </div>
      </div>
    </section>
  );
}
