import { Skeleton } from '@/components/Skeleton/Skeleton';
import { SCHEDULE_EMPTY_COPY } from '../scheduleModel';
import { ScheduleIcon } from './ScheduleIcon';
import '../schedule.scss';

/** Placeholder rows while the schedule loads: 3 in the card, more in the agenda. */
export function ScheduleSkeleton({ count = 3, compact = true }: { count?: number; compact?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading schedule">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="gt-sched__skeleton">
          <Skeleton width={compact ? 46 : 84} height={12} radius={4} />
          <Skeleton width={compact ? 24 : 28} height={compact ? 24 : 28} radius={7} />
          <div className="gt-sched__skeleton-lines">
            <Skeleton width={i % 2 ? '48%' : '62%'} height={12} radius={4} />
            <Skeleton width={i % 2 ? '70%' : '36%'} height={10} radius={4} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A quiet failure with a way to try again; never a red panel. The card omits the icon well. */
export function ScheduleError({ onRetry, compact = true }: { onRetry?: () => void; compact?: boolean }) {
  return (
    <div className="gt-sched__state gt-sched__state--error" role="alert">
      {!compact && (
        <span className="gt-sched__state-icon">
          <ScheduleIcon name="circle-alert" size={18} />
        </span>
      )}
      <p className="gt-sched__state-title">Couldn’t load your schedule</p>
      <p className="gt-sched__state-hint">
        Check your connection
        {onRetry ? (
          <>
            , then{' '}
            <button type="button" className="gt-sched__retry" onClick={onRetry}>
              try again
            </button>
          </>
        ) : (
          ' and refresh'
        )}
        .
      </p>
    </div>
  );
}

/**
 * The schedule with nothing to load: no class selected, or a preview the schedule is not part of.
 * The calendar well, the promised copy and an optional note under it.
 */
export function ScheduleEmpty({ note }: { note?: string }) {
  return (
    <div className="gt-sched gt-sched--compact">
      <div className="gt-sched__state">
        <span className="gt-sched__state-icon">
          <ScheduleIcon name="calendar-days" size={18} />
        </span>
        <p className="gt-sched__state-title">{SCHEDULE_EMPTY_COPY}</p>
        {note && <p className="gt-sched__state-hint">{note}</p>}
      </div>
    </div>
  );
}
