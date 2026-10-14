import React from 'react';
import { AnalyticsIcon } from './ChartLegend.jsx';
import { LivePill } from './LivePill.jsx';
import { DefinitionPopover } from './DefinitionPopover.jsx';
import { ChartEmptyState } from './ChartEmptyState.jsx';

/**
 * Container for every analytics chart (.gt-chart-card). White, 1px border,
 * radius 10, hairline shadow, padding 16; header divided by a 1px rule.
 * `data-state`: loading (skeleton, first load only) · refetching (body at 60%
 * opacity, frame held) · ready · empty (ChartEmptyState) · error (inline
 * error-soft strip "This card could not load." + Retry; the page is unaffected).
 */
export function ChartCard({
  title,
  subtitle,
  definition,
  live = false,
  actions = null,
  state = 'ready',
  emptyMessage,
  errorMessage = 'This card could not load.',
  onRetry,
  footnote,
  hero,
  heroMeta,
  wide = false,
  skeletonRows = 4,
  className = '',
  children,
  ...rest
}) {
  const def = typeof definition === 'string' ? { body: definition } : definition;
  const empty = emptyMessage || { title: 'Nothing to list' };
  return (
    <section
      className={['gt-chart-card', wide ? 'gt-chart-card--wide' : '', className].filter(Boolean).join(' ')}
      data-state={state}
      aria-busy={state === 'loading' || state === 'refetching' || undefined}
      {...rest}
    >
      <header className="gt-chart-card__head">
        <div className="gt-chart-card__titles">
          <div className="gt-chart-card__title-row">
            <h3 className="gt-chart-card__title">{title}</h3>
            {live && <LivePill />}
            {def && <DefinitionPopover title={def.title} body={def.body} learnMoreHref={def.learnMoreHref} />}
          </div>
          {subtitle && <span className="gt-chart-card__subtitle">{subtitle}</span>}
        </div>
        {actions && <div className="gt-chart-card__actions">{actions}</div>}
      </header>
      <div className="gt-chart-card__body">
        {state === 'loading' ? (
          <div className="gt-chart-card__skeleton" aria-label="Loading">
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <span key={i} className="gt-skeleton" style={{ width: `${92 - i * 14}%` }} />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="gt-chart-card__error" role="alert">
            <AnalyticsIcon name="alert-circle" size={15} />
            <span>{errorMessage}</span>
            {onRetry && <button type="button" className="gt-chart-card__retry" onClick={onRetry}>Retry</button>}
          </div>
        ) : state === 'empty' ? (
          <ChartEmptyState icon={empty.icon} title={empty.title} hint={empty.hint} />
        ) : (
          <>
            {hero !== undefined && (
              <div className="gt-chart-card__hero">
                {hero}
                {heroMeta && <span className="gt-chart-card__hero-meta">{heroMeta}</span>}
              </div>
            )}
            {children}
          </>
        )}
      </div>
      {footnote && <footer className="gt-chart-card__foot">{footnote}</footer>}
    </section>
  );
}

/** Header tool button (Table / Export) — `pressed` renders the toggled state. */
export function ChartCardTool({ icon, label, pressed, onClick, disabled = false, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={['gt-chart-card__tool', className].filter(Boolean).join(' ')}
      aria-pressed={pressed === undefined ? undefined : pressed}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon && <AnalyticsIcon name={icon} size={13} />}
      {label}
    </button>
  );
}

/** Header checkbox (e.g. "Compare with previous range"). */
export function ChartCardCheck({ label, checked, onChange, disabled = false, className = '' }) {
  return (
    <label className={['gt-chart-card__check', className].filter(Boolean).join(' ')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange && onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  );
}
