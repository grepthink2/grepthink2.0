import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNow } from '@/lib/useNow';
import {
  SCHEDULE_EMPTY_COPY,
  findOverlaps,
  fmtDayLabel,
  nowIndex,
  todayOrPeek,
  viewerZone,
  zoneDiffers,
  zoneLabel,
  type ScheduleItemData,
  type ScheduleLens,
} from '../scheduleModel';
import { ScheduleDayHeader } from './ScheduleDayHeader';
import { ScheduleDivider } from './ScheduleDivider';
import { ScheduleError, ScheduleSkeleton } from './ScheduleStates';
import { ScheduleIcon } from './ScheduleIcon';
import { ScheduleItem } from './ScheduleItem';
import { ScheduleNowLine } from './ScheduleNowLine';
import '../schedule.scss';

/** Where staff take attendance: the TA Meetings page. */
const MARK_ATTENDANCE_HREF = '/app/ta-meetings';

export interface ScheduleListProps {
  items: ScheduleItemData[];
  /** @default 'ready' */
  status?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /** Pin the clock (tests, demos); otherwise it ticks every 30 s. */
  now?: Date;
  /** The viewer's IANA zone: times render in it. @default the browser's */
  zone?: string;
  /** The class's school's zone (`useSchoolTimezone`): when it differs, the footer says so once and each time's title carries the campus time. */
  schoolZone: string;
  /** Only changes which actions a row offers. @default 'student' */
  lens?: ScheduleLens;
  /** Rows before "+n more today". @default 5 */
  maxItems?: number;
}

const peekDate = (label: { title: string; date: string }): string =>
  label.title === 'Tomorrow' || label.title === 'Today' ? `${label.title} · ${label.date}` : `${label.title}, ${label.date}`;

/**
 * The Today's Schedule card body (the handoff's compact `ScheduleList`): today's items with the Now
 * line, at most `maxItems` then "+n more today"; when today is empty, "Nothing scheduled today" and a
 * peek at the next day that has something; the zone note in a footer when the viewer is away from
 * campus. The card's header belongs to the page. The agenda week is a separate component, so none of
 * its toolbar ships with Home.
 */
export function ScheduleList({
  items, status = 'ready', onRetry, now, zone, schoolZone, lens = 'student', maxItems = 5,
}: ScheduleListProps) {
  const liveNow = useNow(30000, now);
  const navigate = useNavigate();
  const vz = zone ?? viewerZone();
  const overlaps = useMemo(() => findOverlaps(items), [items]);
  const differs = zoneDiffers(vz, schoolZone, liveNow);

  const rows = (dayItems: ScheduleItemData[], withNow: boolean): ReactNode[] => {
    const at = withNow ? nowIndex(dayItems, liveNow) : -1;
    const out: ReactNode[] = [];
    dayItems.forEach((it, i) => {
      if (i === at) out.push(<ScheduleNowLine key="now" now={liveNow} zone={vz} />);
      out.push(
        <ScheduleItem
          key={it.id}
          item={it}
          lens={lens}
          now={liveNow}
          zone={vz}
          schoolZone={schoolZone}
          showSchoolTime={differs}
          overlaps={overlaps.get(it.id) ?? []}
          markAttendanceHref={MARK_ATTENDANCE_HREF}
          onOpen={(open) => {
            if (open.href) void navigate(open.href);
          }}
        />,
      );
    });
    if (at === dayItems.length) out.push(<ScheduleNowLine key="now" now={liveNow} zone={vz} />);
    return out;
  };

  let body: ReactNode;
  if (status === 'loading') {
    body = <ScheduleSkeleton count={3} />;
  } else if (status === 'error') {
    body = <ScheduleError onRetry={onRetry} />;
  } else {
    const pick = todayOrPeek(items, liveNow, vz);
    if (pick.mode === 'today') {
      const shown = pick.day.items.slice(0, maxItems);
      const extra = pick.day.items.length - shown.length;
      body = (
        <>
          {pick.day.dividers.map((d) => <ScheduleDivider key={d.id} item={d} isToday />)}
          <ol className="gt-sched__items" aria-label="Today">{rows(shown, true)}</ol>
          {extra > 0 && <p className="gt-sched__more">+{extra} more today</p>}
        </>
      );
    } else {
      const label = pick.day ? peekDate(fmtDayLabel(pick.day.key, liveNow, vz)) : null;
      body = (
        <>
          {pick.todayDividers.map((d) => <ScheduleDivider key={d.id} item={d} isToday />)}
          <div className="gt-sched__state gt-sched__state--quiet">
            <p className="gt-sched__state-title">Nothing scheduled today</p>
            {!pick.day && <p className="gt-sched__state-hint">{SCHEDULE_EMPTY_COPY}</p>}
          </div>
          {pick.day && label && (
            <>
              <ScheduleDayHeader title="Next" date={label} as="h4" />
              <ol className="gt-sched__items" aria-label={`Next: ${label}`}>{rows(pick.day.items.slice(0, 3), false)}</ol>
              {pick.day.items.length > 3 && <p className="gt-sched__more">+{pick.day.items.length - 3} more that day</p>}
            </>
          )}
        </>
      );
    }
  }

  return (
    <div className="gt-sched gt-sched--compact">
      {body}
      {status === 'ready' && differs && (
        <div className="gt-sched__footer">
          <span className="gt-sched__zone">
            <ScheduleIcon name="globe" size={13} />
            Times in {zoneLabel(vz, liveNow)} · campus is {zoneLabel(schoolZone, liveNow)}
          </span>
        </div>
      )}
    </div>
  );
}
