import React from 'react';

/**
 * White surface card. `shadow`: card (2.61px signature) · hairline (1px border + whisper) · none.
 * `bordered`: 1px border, no shadow, radius 7 — for cards nested in a card or a list.
 * Interactive (`href` or `onClick`): the title becomes a stretched link / button, so the whole
 * card is the target while header actions and the footer stay clickable above it; hover lifts the
 * shadow, keyboard focus rings the card, `selected` draws the green selected border.
 * `actions` sit right of the title (as ChartCard's tools do).
 */
export function Card({
  children, header, footer, title, subtitle, actions, titleAs = 'h3', shadow = 'card', bordered = false,
  href, onClick, selected, padded = true, className = '', ...rest
}) {
  const interactive = !!(href || onClick) && title != null;
  const T = titleAs;
  const titleNode = title != null && (
    <T className="gt-card__title">
      {!interactive ? title : href
        ? <a className="gt-card__link" href={href}>{title}</a>
        : <button type="button" className="gt-card__link" onClick={onClick} aria-pressed={selected === undefined ? undefined : !!selected}>{title}</button>}
    </T>
  );
  return (
    <div
      className={['gt-card', bordered ? 'gt-card--bordered' : `gt-card--${shadow}`, interactive ? 'gt-card--interactive' : '', selected ? 'gt-card--selected' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {(header || title != null || actions) && (
        <div className="gt-card__header">
          {header || (
            <div className="gt-card__heading">
              {titleNode}
              {subtitle && <p className="gt-card__subtitle">{subtitle}</p>}
            </div>
          )}
          {actions && <div className="gt-card__actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'gt-card__body' : 'gt-card__body gt-card__body--flush'}>{children}</div>
      {footer && <div className="gt-card__footer">{footer}</div>}
    </div>
  );
}
