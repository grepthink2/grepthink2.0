import { Skeleton } from '@/components/Skeleton/Skeleton';
import './scheduleSkeleton.scss';

/**
 * Placeholder rows while the schedule loads. Home shows them while the week's own code loads too, so
 * this file carries nothing but the kit's Skeleton and its own few rules.
 */
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
