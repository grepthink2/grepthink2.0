import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { NoClassSelected } from '@/components/EmptyState/EmptyState';
import { useClass } from '@/lib/classContext';
import { useSchoolTimezone } from '@/lib/institutions';
import { openClassSelector } from '@/lib/openClassSelector';
import { usePreview } from '@/lib/previewContext';
import { startOfDayIn } from '@/lib/startOfDayIn';
import { useNow } from '@/lib/useNow';
import { ScheduleAgenda } from '../components/ScheduleAgenda';
import { ScheduleEmpty } from '../components/ScheduleStates';
import { useSchedule } from '../hooks/useSchedule';
import { dayKey, shiftKey, viewerZone, type ScheduleKind } from '../scheduleModel';
import { agendaDayId, fitRange, itemsInWeek, nextUp, parseDayParam, weekKeys } from '../scheduleWeek';
import './SchedulePage.scss';

/** How far an empty week looks ahead for "Next up": one request, cut by fitRange to the endpoint's six weeks. */
const LOOK_AHEAD_DAYS = 42;

/** Set on a week switch, so only a `?day=` someone opened scrolls the page. */
interface ScheduleLocationState {
  weekSwitch?: boolean;
}

/**
 * /app/schedule: the selected class's week, one request per week shown. `?day=YYYY-MM-DD` opens the
 * week holding that day, scrolled to it; the week switcher writes `?day=` too, so Back returns to the
 * week before. With no class it asks for one; in the student preview it asks nothing.
 */
export default function SchedulePage() {
  const { selectedClass } = useClass();
  const { isPreviewing } = usePreview();
  const schoolZone = useSchoolTimezone(selectedClass?.institution?.id);
  const now = useNow();
  const zone = viewerZone();
  const today = dayKey(now, zone);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const focusDay = parseDayParam(params.get('day'));
  const monday = weekKeys(focusDay ?? today)[0];
  const [kinds, setKinds] = useState<ScheduleKind[]>([]);

  const classId = selectedClass?.id ?? null;
  const range = useMemo(
    () => ({ from: startOfDayIn(zone, monday), to: startOfDayIn(zone, shiftKey(monday, 7)) }),
    [zone, monday],
  );
  const week = useSchedule(classId, range.from, range.to, { enabled: !isPreviewing });
  // The hook keeps the last answer through a reload, but here that answer is another week's: until
  // this week's lands it is loading, and a failure is an error.
  const weekStatus = week.status === 'error' || week.error
    ? 'error'
    : week.status === 'ready' && !week.reloading ? 'ready' : 'loading';

  // An empty week looks once at the six weeks after it (or after today, for a week gone by) for "Next up".
  // "Empty" as the agenda counts it: nothing whose day is in the week (an answer may hold an item
  // that started the night before and runs into the week).
  const weekEmpty = weekStatus === 'ready' && week.answer !== null
    && itemsInWeek(week.answer.items, weekKeys(monday), zone).length === 0;
  const lookKey = shiftKey(monday, 7) > today ? shiftKey(monday, 7) : today;
  const lookRange = useMemo(
    () => fitRange(startOfDayIn(zone, lookKey), startOfDayIn(zone, shiftKey(lookKey, LOOK_AHEAD_DAYS))),
    [zone, lookKey],
  );
  const ahead = useSchedule(classId, lookRange.from, lookRange.to, { enabled: !isPreviewing && weekEmpty });
  // Only this window's own answer: while it reloads, the hook still holds another week's.
  const aheadSettled = ahead.status === 'ready' && !ahead.reloading && !ahead.error;
  const next = weekEmpty && aheadSettled && ahead.answer ? nextUp(ahead.answer.items, now, zone) : null;

  const switched = Boolean((location.state as ScheduleLocationState | null)?.weekSwitch);
  const ready = weekStatus === 'ready';
  useEffect(() => {
    if (!focusDay || switched || !ready) return;
    // The day's section, whose scroll margin clears the app's sticky header.
    document.getElementById(agendaDayId(focusDay))?.closest('.gt-sched__day')?.scrollIntoView?.({ block: 'start' });
  }, [focusDay, switched, ready]);

  if (!classId) return <div className="gt-sched-page"><NoClassSelected onSelectClass={openClassSelector} /></div>;
  if (isPreviewing) {
    return (
      <div className="gt-sched-page">
        <ScheduleEmpty note="The schedule isn't part of the student preview." />
      </div>
    );
  }

  const onWeekChange = (anchor: string | null) => {
    const nextParams = new URLSearchParams(params);
    if (anchor) nextParams.set('day', anchor);
    else nextParams.delete('day');
    setParams(nextParams, { state: { weekSwitch: true } satisfies ScheduleLocationState });
  };

  return (
    <div className="gt-sched-page">
      <ScheduleAgenda
        items={week.answer?.items ?? []}
        status={weekStatus}
        onRetry={week.retry}
        now={now}
        zone={zone}
        schoolZone={schoolZone}
        lens={week.answer?.lens ?? 'student'}
        weekAnchor={monday}
        onWeekChange={onWeekChange}
        kinds={kinds}
        onKindsChange={setKinds}
        next={next}
        focusDay={switched ? null : focusDay}
      />
    </div>
  );
}
