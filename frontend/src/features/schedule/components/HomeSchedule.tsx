import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { startOfDayIn } from '@/lib/startOfDayIn';
import { useNow } from '@/lib/useNow';
import { useSchedule } from '../hooks/useSchedule';
import { dayKey, shiftKey, viewerZone } from '../scheduleModel';
import { agendaDayId, fitRange, itemsInWeek, nextUp, parseDayParam, weekDaysFrom, weekKeys } from '../scheduleWeek';
import { ScheduleAgenda } from './ScheduleAgenda';
import { ScheduleEmpty } from './ScheduleStates';
import './homeSchedule.scss';

/** How far an empty week looks ahead for "Next up": one request, cut by fitRange to the endpoint's six weeks. */
const LOOK_AHEAD_DAYS = 42;

/** Set on a week switch, so only a `?day=` someone opened scrolls to its day. */
interface ScheduleLocationState {
  weekSwitch?: boolean;
}

export interface HomeScheduleProps {
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
 * The schedule card's body on Home: the selected class's week, one request per week shown. This week
 * runs from today through Sunday; any other week, Monday to Sunday. `?day=YYYY-MM-DD` on the current
 * URL opens the week holding that day, scrolled to it; the week switcher writes `?day=` too, so Back
 * returns to the week before, and only a `?day=` someone opened (a link, the old /app/schedule)
 * scrolls. Home loads this lazily (HomeScheduleCard), so none of the week's code is in the entry chunk.
 */
export default function HomeSchedule({ classId, schoolZone, preview = false, now: fixedNow, zone }: HomeScheduleProps) {
  const now = useNow(30000, fixedNow);
  const vz = zone ?? viewerZone();
  const today = dayKey(now, vz);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const focusDay = parseDayParam(params.get('day'));
  const anchor = focusDay ?? today;
  const monday = weekKeys(anchor)[0];
  const days = useMemo(() => weekDaysFrom(anchor, today), [anchor, today]);
  const first = days[0];

  const range = useMemo(
    () => ({ from: startOfDayIn(vz, first), to: startOfDayIn(vz, shiftKey(monday, 7)) }),
    [vz, first, monday],
  );
  const week = useSchedule(classId, range.from, range.to, { enabled: !preview });
  // The hook keeps the last answer through a reload, but here that answer is another week's: until
  // this week's lands it is loading, and a failure is an error.
  const weekStatus = week.status === 'error' || week.error
    ? 'error'
    : week.status === 'ready' && !week.reloading ? 'ready' : 'loading';

  // An empty week looks once at the six weeks after it (or after today, for a week gone by) for "Next up".
  // "Empty" as the agenda counts it: nothing whose day is one of the days shown, and nothing from the
  // night before that is still on (an answer may hold one that has ended, which does not count).
  const weekEmpty = weekStatus === 'ready' && week.answer !== null && itemsInWeek(week.answer.items, days, vz, now).length === 0;
  const lookKey = shiftKey(monday, 7) > today ? shiftKey(monday, 7) : today;
  const lookRange = useMemo(
    () => fitRange(startOfDayIn(vz, lookKey), startOfDayIn(vz, shiftKey(lookKey, LOOK_AHEAD_DAYS))),
    [vz, lookKey],
  );
  const ahead = useSchedule(classId, lookRange.from, lookRange.to, { enabled: !preview && weekEmpty });
  // Only this window's own answer: while it reloads, the hook still holds another week's.
  const aheadSettled = ahead.status === 'ready' && !ahead.reloading && !ahead.error;
  const next = weekEmpty && aheadSettled && ahead.answer ? nextUp(ahead.answer.items, now, vz) : null;

  const switched = Boolean((location.state as ScheduleLocationState | null)?.weekSwitch);
  const ready = weekStatus === 'ready';
  // Once per history entry: the week loading again (midnight, Try again) leaves the page where it is.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!focusDay || switched || !ready || scrolledFor.current === location.key) return;
    scrolledFor.current = location.key;
    // The day's section, whose scroll margin clears the app's sticky header.
    document.getElementById(agendaDayId(focusDay))?.closest('.gt-sched__day')?.scrollIntoView?.({ block: 'start' });
  }, [focusDay, switched, ready, location.key]);

  if (!classId) return <ScheduleEmpty />;
  if (preview) return <ScheduleEmpty note="The schedule isn't part of the student preview." />;

  const onWeekChange = (weekMonday: string | null) => {
    const nextParams = new URLSearchParams(params);
    if (weekMonday) nextParams.set('day', weekMonday);
    else nextParams.delete('day');
    setParams(nextParams, { state: { weekSwitch: true } satisfies ScheduleLocationState });
  };

  return (
    <div className="gt-sched-home">
      <ScheduleAgenda
        items={week.answer?.items ?? []}
        status={weekStatus}
        onRetry={week.retry}
        now={now}
        zone={vz}
        schoolZone={schoolZone}
        lens={week.answer?.lens ?? 'student'}
        weekAnchor={anchor}
        startDay={today}
        onWeekChange={onWeekChange}
        next={next}
        focusDay={switched ? null : focusDay}
      />
    </div>
  );
}
