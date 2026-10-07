import type { LucideIcon } from 'lucide-react';
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

/** Every chart's container (brief §4 #3). Refetching keeps the previous content at 60% opacity; an error is an inline strip. */
export function ChartCard({ title, subtitle, definition, live, actions, state, emptyMessage, errorMessage, footnote, className, children }: ChartCardProps) {
  let body: ReactNode = children;
  if (state === 'loading') body = <Skeleton width="100%" height={220} />;
  else if (state === 'error') body = <div className="gt-chart-card__error" role="alert">{errorMessage ?? 'This card could not load.'}</div>;
  else if (state === 'empty' && emptyMessage) body = <EmptyState {...emptyMessage} />;
  return (
    <section className={`gt-chart-card${className ? ` ${className}` : ''}`} data-state={state} aria-busy={state === 'loading' || state === 'refetching'}>
      <header className="gt-chart-card__head">
        <div className="gt-chart-card__titles">
          <h2 className="gt-chart-card__title">
            {title}
            {live ? <LivePill /> : null}
            {definition ? <DefinitionPopover {...definition} /> : null}
          </h2>
          {subtitle ? <p className="gt-chart-card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="gt-chart-card__actions">{actions}</div> : null}
      </header>
      <div className="gt-chart-card__body">{body}</div>
      {footnote ? <footer className="gt-chart-card__foot">{footnote}</footer> : null}
    </section>
  );
}
