import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/Button/Button';
import { FilterChipGroup } from '@/components/FilterChip/FilterChipGroup';
import { IconButton } from '@/components/IconButton/IconButton';
import {
  dayKey,
  findOverlaps,
  fmtDayLabel,
  fmtTime,
  groupByDay,
  itemDay,
  kindMeta,
  nowIndex,
  shiftKey,
  zoneDiffers,
  zoneLabel,
  type ScheduleItemData,
  type ScheduleKind,
  type ScheduleLens,
} from '../scheduleModel';
import { AGENDA_KINDS, agendaDayId, fmtWeekLabel, itemsInWeek, weekKeys } from '../scheduleWeek';
import { ScheduleAgendaItem } from './ScheduleAgendaItem';
import { ScheduleDayHeader } from './ScheduleDayHeader';
import { ScheduleDivider } from './ScheduleDivider';
import { ScheduleIcon } from './ScheduleIcon';
import { ScheduleNowLine } from './ScheduleNowLine';
import { ScheduleError, ScheduleSkeleton } from './ScheduleStates';
import '../schedule.scss';
import './scheduleAgenda.scss';

const chipLabel = (kind: ScheduleKind): string => (kind === 'sprint' ? 'Sprints' : kindMeta(kind).filterLabel ?? kindMeta(kind).label);

export interface ScheduleAgendaProps {
  /** The week's items (the answer for the week shown). */
  items: ScheduleItemData[];
  status: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  now: Date;
  /** The viewer's zone: weeks, days and times follow it. */
  zone: string;
  /** The class's school's zone: the zone note and each time's campus title. */
  schoolZone: string;
  lens: ScheduleLens;
  /** Any day of the week shown ('YYYY-MM-DD'). */
  weekAnchor: string;
  /** Another week ('YYYY-MM-DD' of its Monday), or null for this week. */
  onWeekChange: (anchor: string | null) => void;
  /** Kinds shown; empty shows them all. */
  kinds: ScheduleKind[];
  onKindsChange: (kinds: ScheduleKind[]) => void;
  /** For an empty week: the next thing after now, from a look-ahead. */
  next?: ScheduleItemData | null;
  /** A day to show even when it is empty (the `?day=` the page opened on). */
  focusDay?: string | null;
  /** Where staff take attendance. @default '/app/ta-meetings' */
  markAttendanceHref?: string;
}

const peekDate = (label: { title: string; date: string }): string =>
  label.title === 'Tomorrow' || label.title === 'Today' ? `${label.title} · ${label.date}` : `${label.title}, ${label.date}`;

/**
 * The /app/schedule week (the handoff's agenda `ScheduleList`): the week switcher, the range, the
 * zone note and the kind chips; then one white surface of days with sticky headers, each day's sprint
 * rules above its rows, and the Now line on today. Days shown: those with something, today, and the
 * day the page was opened on. Lives in its own chunk with the page, so Home never loads it.
 */
export function ScheduleAgenda({
  items, status, onRetry, now, zone, schoolZone, lens, weekAnchor, onWeekChange, kinds, onKindsChange, next, focusDay = null,
  markAttendanceHref = '/app/ta-meetings',
}: ScheduleAgendaProps) {
  const navigate = useNavigate();
  const today = dayKey(now, zone);
  const keys = useMemo(() => weekKeys(weekAnchor), [weekAnchor]);
  const week = fmtWeekLabel(keys, now, zone);
  const onThisWeek = week.title === 'This week';
  const differs = zoneDiffers(zone, schoolZone, now);

  const inWeek = useMemo(() => itemsInWeek(items, keys, zone), [items, zone, keys]);
  const filtered = useMemo(() => (kinds.length ? inWeek.filter((it) => kinds.includes(it.kind)) : inWeek), [inWeek, kinds]);
  const groups = groupByDay(filtered, { zone, now });
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const overlaps = useMemo(() => findOverlaps(filtered), [filtered]);
  const filtersOn = kinds.length > 0;

  const rows = (dayItems: ScheduleItemData[], withNow: boolean): ReactNode[] => {
    const at = withNow ? nowIndex(dayItems, now) : -1;
    const out: ReactNode[] = [];
    dayItems.forEach((it, i) => {
      if (i === at) out.push(<ScheduleNowLine key="now" now={now} zone={zone} />);
      out.push(
        <ScheduleAgendaItem
          key={it.id}
          item={it}
          lens={lens}
          now={now}
          zone={zone}
          schoolZone={schoolZone}
          showSchoolTime={differs}
          overlaps={overlaps.get(it.id) ?? []}
          markAttendanceHref={markAttendanceHref}
          onOpen={(open) => {
            if (open.href) void navigate(open.href);
          }}
        />,
      );
    });
    if (at === dayItems.length) out.push(<ScheduleNowLine key="now" now={now} zone={zone} />);
    return out;
  };

  const toolbar = (
    <div className="gt-sched__toolbar">
      <div className="gt-sched__week" role="group" aria-label="Week">
        <IconButton size="sm" ariaLabel="Previous week" onClick={() => onWeekChange(shiftKey(keys[0], -7))}>
          <ChevronLeft size={16} aria-hidden="true" />
        </IconButton>
        <Button
          variant="ghost"
          size="sm"
          disabled={onThisWeek}
          title={onThisWeek ? undefined : 'Back to this week'}
          onClick={() => onWeekChange(null)}
        >
          {week.title ?? week.range}
        </Button>
        <IconButton size="sm" ariaLabel="Next week" onClick={() => onWeekChange(shiftKey(keys[0], 7))}>
          <ChevronRight size={16} aria-hidden="true" />
        </IconButton>
      </div>
      {week.title && <span className="gt-sched__range">{week.range}</span>}
      {differs && (
        <span className="gt-sched__zone">
          <ScheduleIcon name="globe" size={13} />
          Times in {zoneLabel(zone, now)} · campus is {zoneLabel(schoolZone, now)}
        </span>
      )}
      <FilterChipGroup
        className="gt-sched__filters"
        ariaLabel="Filter by kind"
        size="sm"
        value={kinds}
        onChange={(value) => onKindsChange(value as ScheduleKind[])}
        options={AGENDA_KINDS.map((kind) => ({ value: kind, label: chipLabel(kind) }))}
      />
    </div>
  );

  let body: ReactNode;
  if (status === 'loading') {
    body = <div className="gt-sched__days"><ScheduleSkeleton count={5} compact={false} /></div>;
  } else if (status === 'error') {
    body = <div className="gt-sched__days"><ScheduleError onRetry={onRetry} compact={false} /></div>;
  } else if (groups.length === 0) {
    const nextLabel = next ? peekDate(fmtDayLabel(itemDay(next, zone), now, zone)) : null;
    body = (
      <div className="gt-sched__days">
        <div className="gt-sched__state">
          <span className="gt-sched__state-icon"><ScheduleIcon name="calendar-days" size={18} /></span>
          {filtersOn && inWeek.length > 0 ? (
            <>
              <p className="gt-sched__state-title">Nothing matches these filters</p>
              <button type="button" className="gt-sched__retry" onClick={() => onKindsChange([])}>Clear filters</button>
            </>
          ) : (
            <>
              <p className="gt-sched__state-title">Nothing scheduled {week.title ? week.title.toLowerCase() : 'that week'}</p>
              {next && nextLabel && (
                <p className="gt-sched__state-hint">
                  Next up: {next.title}{next.teamName ? ` · ${next.teamName}` : ''} · {nextLabel}
                  {next.allDay ? '' : ` · ${fmtTime(next.startsAt, zone)}`}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  } else {
    const shown = keys.filter((k) => byKey.has(k) || k === today || k === focusDay);
    body = (
      <ol className="gt-sched__days">
        {shown.map((k) => {
          const g = byKey.get(k) ?? { key: k, isToday: k === today, dividers: [], items: [] };
          const id = agendaDayId(k);
          return (
            <li key={k} className="gt-sched__day">
              <ScheduleDayHeader dayKey={k} now={now} zone={zone} id={id} />
              {g.dividers.map((d) => <ScheduleDivider key={d.id} item={d} isToday={g.isToday} />)}
              {g.items.length ? (
                <ol className="gt-sched__items" aria-labelledby={id}>{rows(g.items, g.isToday)}</ol>
              ) : (
                // An empty today (or the day asked for) says so; a day with a sprint rule has that.
                g.dividers.length === 0 && <p className="gt-sched-day__empty">Nothing scheduled</p>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section className="gt-sched gt-sched--agenda" aria-label="Schedule">
      {toolbar}
      {body}
    </section>
  );
}
