import React from 'react';

/**
 * White surface card — the app's standard container.
 * `shadow="card"` uses the signature 2.61px shadow; `shadow="hairline"`
 * pairs a 1px border with a 4px whisper shadow (metric cards).
 */
export function Card({
  children,
  header,
  footer,
  title,
  subtitle,
  shadow = 'card',
  padded = true,
  className = '',
  ...rest
}) {
  return (
    <div className={['gt-card', `gt-card--${shadow}`, className].filter(Boolean).join(' ')} {...rest}>
      {(header || title) && (
        <div className="gt-card__header">
          {header || (
            <div>
              <h3 className="gt-card__title">{title}</h3>
              {subtitle && <p className="gt-card__subtitle">{subtitle}</p>}
            </div>
          )}
        </div>
      )}
      <div className={padded ? 'gt-card__body' : 'gt-card__body gt-card__body--flush'}>{children}</div>
      {footer && <div className="gt-card__footer">{footer}</div>}
    </div>
  );
}
