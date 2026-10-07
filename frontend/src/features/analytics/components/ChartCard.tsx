import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { DefinitionPopover } from './DefinitionPopover';
import { EmptyState } from './EmptyState';
import { LivePill } from './LivePill';

export type ChartCardState = 'loading' | 'refetching' | 'ready' | 'empty' | 'error';
export interface ChartCardProps {
  title: string; subtitle?: string; definition?: { title: string; body: string };
  live?: boolean; actions?: ReactNode; state: ChartCardState;
  emptyMessage?: { icon: LucideIcon; title: string; hint: string }; errorMessage?: string;
  footnote?: ReactNode; className?: string; children: ReactNode;
}

const GENERIC_EMPTY = { icon: Inbox, title: 'Nothing to show', hint: 'There is no data for this view yet.' };

/** Every chart's container (brief §4 #3). Refetching keeps the previous content at 60% opacity; an error is an inline strip; an empty card never draws its chart. */
export function ChartCard({ title, subtitle, definition, live, actions, state, emptyMessage, errorMessage, footnote, className, children }: ChartCardProps) {
  let body: ReactNode = children;
  if (state === 'loading') body = <Skeleton width="100%" height={220} />;
  else if (state === 'error') body = <div className="gt-chart-card__error" role="alert">{errorMessage ?? 'This card could not load.'}</div>;
  else if (state === 'empty') body = <EmptyState {...(emptyMessage ?? GENERIC_EMPTY)} />;
  return (
    <section className={`gt-chart-card${className ? ` ${className}` : ''}`} data-state={state} aria-busy={state === 'loading' || state === 'refetching'}>
      <header className="gt-chart-card__head">
        <div className="gt-chart-card__titles">
          <div className="gt-chart-card__title-row">
            <h2 className="gt-chart-card__title">{title}</h2>
            {live ? <LivePill /> : null}
            {definition ? <DefinitionPopover {...definition} cardTitle={title} /> : null}
          </div>
          {subtitle ? <p className="gt-chart-card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="gt-chart-card__actions">{actions}</div> : null}
      </header>
      <div className="gt-chart-card__body">{body}</div>
      {footnote ? <footer className="gt-chart-card__foot">{footnote}</footer> : null}
    </section>
  );
}
