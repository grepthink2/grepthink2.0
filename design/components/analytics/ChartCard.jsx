import React from 'react';
import { AnalyticsIcon } from './ChartLegend.jsx';
import { LivePill } from './LivePill.jsx';
import { InfoPopover } from '../display/InfoPopover.jsx';
import { EmptyState } from '../feedback/EmptyState.jsx';

/**
 * Container for every analytics chart (.gt-chart-card). White, 1px border,
 * radius 10, hairline shadow, padding 16; header divided by a 1px rule.
 * `data-state`: loading (skeleton, first load only) · refetching (body at 60%
 * opacity, frame held) · ready · empty (the kit's EmptyState, variant="card") · error (inline
 * error-soft strip "This card could not load." + Retry; the page is unaffected).
 * The ⓘ is the kit's InfoPopover ("How this is counted"); the header tools are the kit's Button
 * (`pressed` for the Table toggles, `outline` for Refresh and Export CSV) and Checkbox
 * (fold-back 2026-10-22: ChartCardTool, ChartCardCheck, DefinitionPopover and ChartEmptyState left).
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
            {def && <InfoPopover title={def.title || 'How this is counted'} body={def.body} learnMoreHref={def.learnMoreHref} className="gt-definition" />}
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
          <EmptyState variant="card" titleAs="p" icon={<AnalyticsIcon name={empty.icon || 'inbox'} size={18} />} title={empty.title} description={empty.hint} />
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
