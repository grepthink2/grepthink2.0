import { useMemo } from 'react';
import { startOfDayIn } from '@/lib/startOfDayIn';
import { useNow } from '@/lib/useNow';
import { useSchedule } from '../hooks/useSchedule';
import { dayKey, shiftKey, viewerZone } from '../scheduleModel';
import { ScheduleEmpty } from './ScheduleStates';
import { ScheduleList } from './ScheduleList';

/** How far past today the card asks, so an empty today can peek at the next day with something. */
const PEEK_DAYS = 14;

export interface TodayScheduleProps {
  /** The selected class; none shows the empty state and asks nothing. */
  classId: string | null | undefined;
  /** The class's school's zone, from `useSchoolTimezone(class.institution.id)`. */
  schoolZone: string;
  /** "View class as student": the schedule is not part of the preview, so nothing is asked. */
  preview?: boolean;
  /** Pin the clock (tests, the local harness); otherwise it ticks every 30 s. */
  now?: Date;
  /** The viewer's zone. @default the browser's */
  zone?: string;
}

/**
 * The Today's Schedule card body on Home: one request for today and the 14 days after it, in the
 * viewer's zone, shown by the compact `ScheduleList`. The card's header is the page's.
 */
export function TodaySchedule({ classId, schoolZone, preview = false, now, zone }: TodayScheduleProps) {
  const liveNow = useNow(30000, now);
  const vz = zone ?? viewerZone();
  const today = dayKey(liveNow, vz);
  const range = useMemo(
    () => ({ from: startOfDayIn(vz, today), to: startOfDayIn(vz, shiftKey(today, PEEK_DAYS + 1)) }),
    [vz, today],
  );
  const schedule = useSchedule(classId, range.from, range.to, { enabled: !preview });

  if (!classId) return <ScheduleEmpty />;
  if (preview) return <ScheduleEmpty note="The schedule isn't part of the student preview." />;
  return (
    <ScheduleList
      items={schedule.answer?.items ?? []}
      status={schedule.status === 'ready' ? 'ready' : schedule.status === 'error' ? 'error' : 'loading'}
      onRetry={schedule.retry}
      now={liveNow}
      zone={vz}
      schoolZone={schoolZone}
      lens={schedule.answer?.lens ?? 'student'}
    />
  );
}
