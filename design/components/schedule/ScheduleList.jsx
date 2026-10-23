import React from 'react';
import { Skeleton } from '../feedback/EmptyState.jsx';
import { ScheduleItem, ScheduleIcon } from './ScheduleItem.jsx';
import { ScheduleDivider } from './ScheduleDivider.jsx';
import { ScheduleDayHeader } from './ScheduleDayHeader.jsx';
import {
  SCHOOL_ZONE, SCHEDULE_KINDS, dayKey, shiftKey, weekKeys, groupByDay, findOverlaps, nowIndex, nextUp, todayOrPeek,
  fmtTime, fmtDayLabel, fmtWeekLabel, zoneLabel, zoneDiffers, viewerZone, useNow,
} from './ScheduleModel.jsx';

function NowLine({ now, zone }) {
  const t = fmtTime(now, zone);
  return (
    <li className="gt-sched__now" aria-label={`Now, ${t}`}>
      <span className="gt-sched__now-label">Now · {t}</span>
      <span className="gt-sched__now-line" aria-hidden="true" />
    </li>
  );
}

function SkeletonRows({ count, compact }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading schedule">
      {Array.from({ length: count }).map((_, i) => (
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

function ErrorState({ onRetry, compact }) {
  return (
    <div className="gt-sched__state gt-sched__state--error" role="alert">
      {!compact && <span className="gt-sched__state-icon"><ScheduleIcon name="circle-alert" size={18} /></span>}
      <p className="gt-sched__state-title">Couldn’t load your schedule</p>
      <p className="gt-sched__state-hint">
        Check your connection{onRetry ? <>, then <button type="button" className="gt-sched__retry" onClick={onRetry}>try again</button></> : ' and refresh'}.
      </p>
    </div>
  );
}

const peekDate = (lbl) => (lbl.title === 'Tomorrow' || lbl.title === 'Today' ? `${lbl.title} · ${lbl.date}` : `${lbl.title}, ${lbl.date}`);

/**
 * ScheduleList — `compact` (the Today's Schedule card body: today + Now line, or a peek at the next
 * day) and `agenda` (full-width week with sticky day headers, ‹ This week › and filters).
 * One component for every lens; `lens` only changes the actions rows offer.
 */
export function ScheduleList({
  variant = 'compact', items = [], now, zone, schoolZone = SCHOOL_ZONE, lens = 'student',
  status = 'ready', onRetry,
  maxItems = 5, seeAllHref = '/app/schedule', calendarHref,
  weekAnchor, onWeekChange, classes, classId, onClassChange, kinds, onKindsChange, showEmptyDays = false,
  onJoin, onMarkAttendance, onSetTime, onOpen, expandedId, onToggle,
  className = '',
}) {
  const liveNow = useNow(30000, now instanceof Date ? now : undefined);
  const vz = zone || viewerZone();
  const compact = variant === 'compact';
  const differs = zoneDiffers(vz, schoolZone, liveNow);
  const zoneNote = differs ? `Times in ${zoneLabel(vz, liveNow)} · campus is ${zoneLabel(schoolZone, liveNow)}` : null;
  const today = dayKey(liveNow, vz);

  const [innerExpanded, setInnerExpanded] = React.useState(null);
  const expanded = expandedId !== undefined ? expandedId : innerExpanded;
  const toggle = React.useCallback((it) => { if (onToggle) onToggle(it); else setInnerExpanded((cur) => (cur === it.id ? null : it.id)); }, [onToggle]);
  const overlaps = React.useMemo(() => findOverlaps(items), [items]);
  // agenda state (declared up front so hook order never depends on `variant`)
  const [innerAnchor, setInnerAnchor] = React.useState(today);
  React.useEffect(() => { setInnerAnchor(today); }, [today]);
  const [innerKinds, setInnerKinds] = React.useState([]);
  const [innerClass, setInnerClass] = React.useState('all');

  const common = { variant, lens, now: liveNow, zone: vz, schoolZone, showSchoolTime: differs, onJoin, onMarkAttendance, onSetTime, onOpen, onToggle: toggle };
  const renderItems = (dayItems, withNow) => {
    const ni = withNow ? nowIndex(dayItems, liveNow) : -1;
    const out = [];
    dayItems.forEach((it, i) => {
      if (i === ni) out.push(<NowLine key="now" now={liveNow} zone={vz} />);
      out.push(<ScheduleItem key={it.id} item={it} overlaps={overlaps.get(it.id) || []} expanded={expanded === it.id} {...common} />);
    });
    if (ni === dayItems.length) out.push(<NowLine key="now" now={liveNow} zone={vz} />);
    return out;
  };
  const zoneEl = zoneNote ? <span className="gt-sched__zone"><ScheduleIcon name="globe" size={13} />{zoneNote}</span> : null;
  const calendarLink = calendarHref ? <a className="gt-sched__link" href={calendarHref}><ScheduleIcon name="calendar-plus" size={14} />Add to your calendar</a> : null;

  /* ── compact ─────────────────────────────────────────────── */
  if (compact) {
    let body;
    let footerLinks = null;
    if (status === 'loading') body = <SkeletonRows count={3} compact />;
    else if (status === 'error') body = <ErrorState onRetry={onRetry} compact />;
    else {
      const pick = todayOrPeek(items, liveNow, vz);
      if (pick.mode === 'today') {
        const shown = pick.day.items.slice(0, maxItems);
        const extra = pick.day.items.length - shown.length;
        body = (
          <>
            {pick.day.dividers.map((d) => <ScheduleDivider key={d.id} item={d} isToday />)}
            <ol className="gt-sched__items" aria-label="Today">{renderItems(shown, true)}</ol>
            {extra > 0 && <div className="gt-sched__more"><a className="gt-sched__link" href={seeAllHref}>+{extra} more today<ScheduleIcon name="arrow-right" size={13} /></a></div>}
          </>
        );
        footerLinks = <a className="gt-sched__link" href={seeAllHref}>See week<ScheduleIcon name="arrow-right" size={13} /></a>;
      } else {
        const lbl = pick.day ? fmtDayLabel(pick.day.key, liveNow, vz) : null;
        body = (
          <>
            {(pick.todayDividers || []).map((d) => <ScheduleDivider key={d.id} item={d} isToday />)}
            <div className="gt-sched__state gt-sched__state--quiet">
              <p className="gt-sched__state-title">Nothing scheduled today</p>
              {!pick.day && <p className="gt-sched__state-hint">Class events and deadlines will appear here.</p>}
            </div>
            {pick.day && (
              <>
                <ScheduleDayHeader title="Next" date={peekDate(lbl)} as="h4" />
                <ol className="gt-sched__items" aria-label={`Next: ${peekDate(lbl)}`}>{renderItems(pick.day.items.slice(0, 3), false)}</ol>
                {pick.day.items.length > 3 && <div className="gt-sched__more"><a className="gt-sched__link" href={seeAllHref}>+{pick.day.items.length - 3} more that day<ScheduleIcon name="arrow-right" size={13} /></a></div>}
              </>
            )}
          </>
        );
        footerLinks = <>{calendarLink}<a className="gt-sched__link" href={seeAllHref}>See week<ScheduleIcon name="arrow-right" size={13} /></a></>;
      }
    }
    return (
      <div className={['gt-sched', 'gt-sched--compact', className].filter(Boolean).join(' ')}>
        {body}
        {status === 'ready' && (
          <div className="gt-sched__footer">
            {zoneEl || <span />}
            <span style={{ display: 'inline-flex', gap: 14 }}>{footerLinks}</span>
          </div>
        )}
      </div>
    );
  }

  /* ── agenda ──────────────────────────────────────────────── */
  const anchor = weekAnchor || innerAnchor;
  const keys = weekKeys(anchor);
  const setAnchor = (k) => (onWeekChange ? onWeekChange(k) : setInnerAnchor(k));
  const wk = fmtWeekLabel(keys, liveNow, vz);
  const onThisWeek = wk.title === 'This week';

  const activeKinds = kinds || innerKinds;
  const setKinds = (next) => (onKindsChange ? onKindsChange(next) : setInnerKinds(next));
  const cls = classId || innerClass;
  const setCls = (v) => (onClassChange ? onClassChange(v) : setInnerClass(v));

  const inWeek = items.filter((it) => { const k = dayKey(it.startsAt, vz); return k >= keys[0] && k <= keys[6]; });
  const filtered = inWeek.filter((it) => (cls === 'all' || !it.classId || it.classId === cls) && (it.kind === 'sprint' || activeKinds.length === 0 || activeKinds.includes(it.kind)));
  const groups = groupByDay(filtered, { zone: vz, now: liveNow });
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const shownKeys = keys.filter((k) => showEmptyDays || byKey.has(k) || k === today);
  const hasRows = groups.some((g) => g.items.length);
  const filtersOn = cls !== 'all' || activeKinds.length > 0;

  const toolbar = (
    <div className="gt-sched__toolbar">
      <div className="gt-sched__week" role="group" aria-label="Week">
        <button type="button" className="gt-sched__week-btn" aria-label="Previous week" onClick={() => setAnchor(shiftKey(keys[0], -7))}><ScheduleIcon name="chevron-left" size={16} /></button>
        <button type="button" className="gt-sched__week-cur" disabled={onThisWeek} title={onThisWeek ? undefined : 'Back to this week'} onClick={() => setAnchor(today)}>{wk.title || wk.range}</button>
        <button type="button" className="gt-sched__week-btn" aria-label="Next week" onClick={() => setAnchor(shiftKey(keys[0], 7))}><ScheduleIcon name="chevron-right" size={16} /></button>
      </div>
      {wk.title && <span className="gt-sched__range">{wk.range}</span>}
      {zoneEl}
      <div className="gt-sched__filters" role="group" aria-label="Filters">
        {classes && classes.length > 1 && (
          <span className="gt-sched__select-wrap">
            <select className="gt-sched__select" aria-label="Class" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="all">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <span className="gt-sched__select-chev"><ScheduleIcon name="chevron-down" size={14} /></span>
          </span>
        )}
        {SCHEDULE_KINDS.filter((k) => k.filterLabel).map((k) => {
          const on = activeKinds.includes(k.kind);
          return <button key={k.kind} type="button" className="gt-filter-chip gt-filter-chip--sm" aria-pressed={on} onClick={() => setKinds(on ? activeKinds.filter((x) => x !== k.kind) : [...activeKinds, k.kind])}>{k.filterLabel}</button>;
        })}
      </div>
    </div>
  );

  let body;
  if (status === 'loading') body = <div className="gt-sched__days"><SkeletonRows count={5} /></div>;
  else if (status === 'error') body = <div className="gt-sched__days"><ErrorState onRetry={onRetry} /></div>;
  else if (!hasRows && !groups.some((g) => g.dividers.length)) {
    const next = nextUp(items, liveNow);
    const nextLbl = next ? fmtDayLabel(dayKey(next.startsAt, vz), liveNow, vz) : null;
    body = (
      <div className="gt-sched__days">
        <div className="gt-sched__state">
          <span className="gt-sched__state-icon"><ScheduleIcon name="calendar-days" size={18} /></span>
          <p className="gt-sched__state-title">{filtersOn && inWeek.length ? 'Nothing matches these filters' : `Nothing scheduled ${wk.title ? wk.title.toLowerCase() : 'that week'}`}</p>
          {filtersOn && inWeek.length ? (
            <button type="button" className="gt-sched__retry" onClick={() => { setKinds([]); setCls('all'); }}>Clear filters</button>
          ) : (
            <>
              {next && <p className="gt-sched__state-hint">Next up: {next.title}{next.teamName ? ` · ${next.teamName}` : ''} · {peekDate(nextLbl)}{next.allDay || next.status === 'tbd' ? '' : ` · ${fmtTime(next.startsAt, vz)}`}</p>}
              {calendarLink}
            </>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <ol className="gt-sched__days">
        {shownKeys.map((k) => {
          const g = byKey.get(k) || { key: k, isToday: k === today, dividers: [], items: [] };
          const hid = `gt-sched-day-${k}`;
          return (
            <li key={k} className="gt-sched__day">
              <ScheduleDayHeader dayKey={k} now={liveNow} zone={vz} id={hid} />
              {g.dividers.map((d) => <ScheduleDivider key={d.id} item={d} isToday={g.isToday} />)}
              {g.items.length ? <ol className="gt-sched__items" aria-labelledby={hid}>{renderItems(g.items, g.isToday)}</ol> : <p className="gt-sched-day__empty">Nothing scheduled</p>}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section className={['gt-sched', 'gt-sched--agenda', className].filter(Boolean).join(' ')} aria-label="Schedule">
      {toolbar}
      {body}
    </section>
  );
}
