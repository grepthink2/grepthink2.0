import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { ScheduleDayHeader } from '@features/schedule/components/ScheduleDayHeader';
import { ScheduleIcon } from '@features/schedule/components/ScheduleIcon';
import { ScheduleItem } from '@features/schedule/components/ScheduleItem';
import {
  SCHOOL_ZONE,
  fmtTimeRange,
  groupByDay,
  useNow,
  viewerZone,
  zoneDiffers,
  zoneLabel,
  type ScheduleItemData,
  type SchedulePerson,
} from '@features/schedule/scheduleModel';
import { TeamMeetingForm } from './TeamMeetingForm';
import {
  endsAtOf,
  fmtMeetingWhen,
  fmtMinutes,
  isLive,
  isoMinutes,
  splitMeetings,
  toScheduleItem,
  type TeamMeeting,
  type TeamMeetingPayload,
} from './teamMeetingsModel';
import './teamMeetings.scss';

const SAVE_ERROR = 'Couldn’t save this meeting. Your changes are still here — try again.';
const DELETE_ERROR = 'Couldn’t delete. Try again.';

export interface TeamMeetingsListProps {
  /** manage = Edit Project → Meetings tab (Product Owner); card = the project-page "Team meetings" card body. @default 'manage' */
  variant?: 'manage' | 'card';
  meetings?: TeamMeeting[];
  /** @default 'ready' */
  status?: 'ready' | 'loading' | 'error';
  /** Pin the clock (tests, demos); otherwise ticks every 30s. */
  now?: Date;
  /** Viewer's IANA zone; defaults to the browser's. All times render in it. */
  zone?: string;
  /** When it differs, "Times in … · campus is PT" appears once and each time's title carries the campus time. @default 'America/Los_Angeles' */
  schoolZone?: string;
  /** Product Owner: Add / Edit / Delete (manage) or the quiet "Add one" line when empty (card). @default false */
  canManage?: boolean;
  /** Team label for the ScheduleItem context line (card). */
  teamName?: string;
  /** createdBy id → person, for the organizer avatar (card). */
  people?: Record<string, SchedulePerson>;

  /** Resolve on success, reject on failure: the list shows the inline error and keeps the draft. */
  onCreate?: (value: TeamMeetingPayload) => Promise<unknown> | void;
  onUpdate?: (id: string, value: TeamMeetingPayload) => Promise<unknown> | void;
  onDelete?: (id: string) => Promise<unknown> | void;
  onRetry?: () => void;
  /** card: "Add one", which opens the Edit Project modal on the Meetings tab. */
  onManage?: () => void;
  onJoin?: (item: ScheduleItemData) => void;
  /** card: "+n more · See all in Schedule" target. @default '/app/schedule' */
  scheduleHref?: string;
  /** card: upcoming rows before "+n more". @default 5 */
  maxUpcoming?: number;

  /** Initial uncontrolled state (demos / tests). */
  defaultEditingId?: 'new' | string | null;
  defaultConfirmId?: string | null;
  defaultPastOpen?: boolean;
  className?: string;
}

/**
 * A team's one-off meetings. Port of design/components/domain/TeamMeetingsList.jsx (the handoff in
 * design/design_handoff_team_meetings/).
 * `variant="manage"` is the Edit Project → Meetings tab (Product Owner only): upcoming first, "Past (n)"
 *   collapsed, Edit / Delete per row. "Add meeting" opens TeamMeetingForm above the list, Edit puts it in
 *   place of the row, Delete confirms inline. One editor at a time.
 * `variant="card"` is the project-page "Team meetings" card body for every member: upcoming meetings as
 *   compact ScheduleItem rows grouped by day, "Past meetings (n)" collapsed, and for the Product Owner a
 *   quiet "Add one" line when there are none (showTeamMeetingsCard() says whether to render the card).
 */
export function TeamMeetingsList({
  variant = 'manage', meetings = [], status = 'ready', now: nowProp, zone, schoolZone = SCHOOL_ZONE, canManage = false,
  teamName, people = {}, onCreate, onUpdate, onDelete, onRetry, onManage, onJoin, scheduleHref = '/app/schedule',
  maxUpcoming = 5, defaultEditingId = null, defaultConfirmId = null, defaultPastOpen = false, className = '',
}: TeamMeetingsListProps) {
  const now = useNow(30000, nowProp);
  const vz = zone || viewerZone();
  /** 'new' or the id of the meeting being edited. */
  const [editing, setEditing] = useState<string | null>(defaultEditingId);
  const [confirmId, setConfirmId] = useState<string | null>(defaultConfirmId);
  const [pastOpen, setPastOpen] = useState(defaultPastOpen);
  /** The row an editor or delete confirm was opened on, and the list it was in then. */
  const [held, setHeld] = useState<HeldRow | null>(null);
  /** What is being saved: 'new', a meeting id, or `del:<id>` for a delete. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Which of those keys failed last time. */
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [announce, setAnnounce] = useState('');
  const uid = useId();

  const split = splitMeetings(meetings, now);
  const inPastNow = (id: string): boolean => split.past.some((m) => m.id === id);
  // A row with an open editor or delete confirm stays in the list it was in when that opened, until
  // it closes: folding Past can't hide it, and a meeting that ends meanwhile keeps its form and draft
  // (React keeps a row's state only while the row stays in one list).
  const openId = editing && editing !== 'new' ? editing : confirmId;
  const hold = !openId ? null : held?.id === openId ? held : { id: openId, inPast: inPastNow(openId) };
  const { upcoming, past } = holdRow(split, hold);
  const holdsPast = !!hold?.inPast && past.some((m) => m.id === hold.id);
  const showPast = pastOpen || holdsPast;
  const differs = zoneDiffers(vz, schoolZone, now);
  const zoneNote = differs ? `Times in ${zoneLabel(vz, now)} · campus is ${zoneLabel(schoolZone, now)}` : null;
  const campusRange = (m: TeamMeeting): string | undefined =>
    differs ? `${fmtTimeRange({ startsAt: m.startsAt, endsAt: endsAtOf(m) }, schoolZone)} ${zoneLabel(schoolZone, m.startsAt)}` : undefined;

  const run = async (key: string, action: () => Promise<unknown> | void, done: () => void) => {
    setBusy(key);
    setFailed((f) => ({ ...f, [key]: false }));
    try {
      await action();
      done();
    } catch {
      setFailed((f) => ({ ...f, [key]: true }));
    } finally {
      setBusy(null);
    }
  };
  const save = (key: string, value: TeamMeetingPayload) =>
    run(key, () => (key === 'new' ? onCreate?.(value) : onUpdate?.(key, value)), () => {
      setEditing(null);
      setAnnounce(key === 'new' ? 'Meeting added.' : 'Meeting saved.');
    });
  const remove = (m: TeamMeeting) =>
    run(`del:${m.id}`, () => onDelete?.(m.id), () => {
      setConfirmId(null);
      setAnnounce('Meeting deleted.');
    });
  // An editor or a confirm opens without the error its last attempt left behind, and holds its row.
  const startEdit = (key: string) => {
    setConfirmId(null);
    setFailed((f) => ({ ...f, [key]: false }));
    if (key !== 'new') setHeld({ id: key, inPast: inPastNow(key) });
    setEditing(key);
  };
  const startDelete = (id: string) => {
    setFailed((f) => ({ ...f, [`del:${id}`]: false }));
    setHeld({ id, inPast: inPastNow(id) });
    setConfirmId(id);
  };
  const cls = ['gt-tm', `gt-tm--${variant}`, className].filter(Boolean).join(' ');

  /* ── card: compact ScheduleItem rows grouped by day ─────────────────────────────────────── */
  if (variant === 'card') {
    if (status === 'loading') {
      return (
        <div className={cls} role="status" aria-busy="true" aria-label="Loading team meetings">
          {[0, 1].map((i) => <CardSkeleton key={i} />)}
        </div>
      );
    }
    if (status === 'error') return <div className={cls}><LoadError onRetry={onRetry} /></div>;
    if (!upcoming.length && !past.length) {
      return canManage ? (
        <div className={cls}>
          <p className="gt-tm__quiet">
            No team meetings yet. <button type="button" className="gt-tm__link" onClick={onManage}>Add one</button>
          </p>
        </div>
      ) : null;
    }
    const shown = upcoming.slice(0, maxUpcoming);
    const more = upcoming.length - shown.length;
    // The card's own title is an h3 on the project page, so its day headings are h4s.
    const rows = (list: TeamMeeting[]) =>
      groupByDay(list.map((m) => toScheduleItem(m, { teamName, people })), { zone: vz, now }).map((group) => (
        <Fragment key={group.key}>
          <ScheduleDayHeader dayKey={group.key} now={now} zone={vz} as="h4" />
          <ol className="gt-sched__items">
            {group.items.map((item) => (
              <ScheduleItem key={item.id} item={item} now={now} zone={vz} schoolZone={schoolZone} showSchoolTime={differs} onJoin={onJoin} />
            ))}
          </ol>
        </Fragment>
      ));
    return (
      <div className={cls}>
        <div className="gt-sched gt-sched--compact">
          {shown.length ? rows(shown) : <p className="gt-tm__quiet">No upcoming meetings.</p>}
          {more > 0 && (
            <p className="gt-tm__more">
              <a className="gt-tm__link" href={scheduleHref}>
                +{more} more · See all in Schedule<ScheduleIcon name="arrow-right" size={13} />
              </a>
            </p>
          )}
          {past.length > 0 && (
            <div className="gt-tm__past">
              <button
                type="button"
                className="gt-tm__past-toggle"
                aria-expanded={pastOpen}
                aria-controls={`${uid}-past`}
                onClick={() => setPastOpen(!pastOpen)}
              >
                <ScheduleIcon name="chevron-right" size={14} />Past meetings ({past.length})
              </button>
              {pastOpen && <div id={`${uid}-past`}>{rows(past)}</div>}
            </div>
          )}
          {zoneNote && (
            <div className="gt-sched__footer">
              <span className="gt-sched__zone"><ScheduleIcon name="globe" size={13} />{zoneNote}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── manage: the Meetings tab ───────────────────────────────────────────────────────────── */
  const row = (m: TeamMeeting, isPastRow: boolean): ReactNode => {
    if (editing === m.id) {
      return (
        <li key={m.id} className="gt-tm-row gt-tm-row--editing">
          <TeamMeetingForm
            mode="edit"
            meeting={m}
            now={nowProp}
            zone={vz}
            schoolZone={schoolZone}
            saving={busy === m.id}
            error={failed[m.id] ? SAVE_ERROR : null}
            onSubmit={(value) => void save(m.id, value)}
            onCancel={() => setEditing(null)}
          />
        </li>
      );
    }
    if (confirmId === m.id) {
      return (
        <ConfirmRow
          key={m.id}
          meeting={m}
          busy={busy === `del:${m.id}`}
          error={failed[`del:${m.id}`] ? DELETE_ERROR : null}
          onConfirm={() => void remove(m)}
          onCancel={() => setConfirmId(null)}
        />
      );
    }
    const when = fmtMeetingWhen(m, vz, now);
    const live = !isPastRow && isLive(m, now);
    return (
      <li
        key={m.id}
        className={['gt-tm-row', isPastRow ? 'gt-tm-row--past' : '', live ? 'gt-tm-row--live' : ''].filter(Boolean).join(' ')}
        aria-current={live ? 'true' : undefined}
      >
        <span className="gt-tm-row__tile"><ScheduleIcon name="users" size={16} /></span>
        <div className="gt-tm-row__main">
          <div className="gt-tm-row__head">
            <span className="gt-tm-row__title">{m.title}</span>
            {live && <span className="gt-sched-item__live"><span className="gt-sched-item__live-dot" aria-hidden="true" />Live</span>}
          </div>
          <div className="gt-tm-row__when" title={campusRange(m)}>
            <time className="gt-tm-row__day" dateTime={m.startsAt}>{when.day}</time>
            <span className="gt-tm-row__sep" aria-hidden="true">·</span>
            <span className="gt-tm-row__range">
              <time dateTime={m.startsAt}>{when.start}</time> – <time dateTime={endsAtOf(m)}>{when.end}</time>
            </span>
            <time className="gt-tm-row__dur" dateTime={isoMinutes(m.durationMinutes)}>{fmtMinutes(m.durationMinutes)}</time>
            {m.location && <span className="gt-tm-row__place"><ScheduleIcon name="map-pin" size={12} />{m.location}</span>}
            {m.zoomUrl && (
              <a className="gt-tm-row__place gt-tm-row__place--link" href={m.zoomUrl} target="_blank" rel="noreferrer">
                <ScheduleIcon name="video" size={12} />Zoom
              </a>
            )}
          </div>
          {m.note && <p className="gt-tm-row__note" title={m.note}>{m.note}</p>}
        </div>
        {canManage && (
          <div className="gt-tm-row__actions">
            <button type="button" className="gt-tm__btn" onClick={() => startEdit(m.id)} disabled={!!editing} aria-label={`Edit ${m.title}`}>
              Edit
            </button>
            <button
              type="button"
              className="gt-tm__btn gt-tm__btn--danger"
              onClick={() => startDelete(m.id)}
              disabled={!!editing}
              aria-label={`Delete ${m.title}`}
            >
              Delete
            </button>
          </div>
        )}
      </li>
    );
  };

  let body: ReactNode;
  if (status === 'loading') {
    body = (
      <div role="status" aria-busy="true" aria-label="Loading team meetings">
        {[0, 1, 2].map((i) => (
          <div key={i} className="gt-tm__skeleton">
            <Skeleton width={28} height={28} radius={7} />
            <div className="gt-tm__skeleton-lines"><Skeleton width="42%" height={12} /><Skeleton width="68%" height={10} /></div>
          </div>
        ))}
      </div>
    );
  } else if (status === 'error') {
    body = <LoadError onRetry={onRetry} />;
  } else if (!meetings.length && editing !== 'new') {
    body = (
      <div className="gt-tm__empty">
        <span className="gt-tm__empty-icon"><ScheduleIcon name="calendar-days" size={18} /></span>
        <p className="gt-tm__empty-title">No team meetings yet</p>
        <p className="gt-tm__empty-hint">A design review, sprint planning, a sponsor demo — everyone on the team sees them in their schedule.</p>
        {canManage && (
          <button type="button" className="gt-button gt-button--primary gt-button--sm" onClick={() => startEdit('new')}>
            <span className="gt-button__icon"><ScheduleIcon name="calendar-plus" size={15} /></span>
            <span className="gt-button__label">Add meeting</span>
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <>
        {upcoming.length > 0 && <ol className="gt-tm__list">{upcoming.map((m) => row(m, false))}</ol>}
        {!upcoming.length && meetings.length > 0 && editing !== 'new' && <p className="gt-tm__quiet">No upcoming meetings.</p>}
        {past.length > 0 && (
          <div className="gt-tm__past">
            <button
              type="button"
              className="gt-tm__past-toggle"
              aria-expanded={showPast}
              aria-controls={`${uid}-past`}
              onClick={() => setPastOpen(!pastOpen)}
              disabled={holdsPast}
            >
              <ScheduleIcon name="chevron-right" size={14} />Past ({past.length})
            </button>
            {showPast && <ol id={`${uid}-past`} className="gt-tm__list gt-tm__list--past">{past.map((m) => row(m, true))}</ol>}
          </div>
        )}
      </>
    );
  }

  const count = status === 'ready' && meetings.length ? `${upcoming.length} upcoming${past.length ? ` · ${past.length} past` : ''}` : null;
  return (
    <section className={cls} aria-label="Team meetings">
      <div className="gt-tm__head">
        <p className="gt-tm__hint">
          One-off meetings for the whole team. They show up in everyone’s schedule and calendar feed.
          {count && <span className="gt-tm__count">{count}</span>}
        </p>
        {canManage && status === 'ready' && meetings.length > 0 && (
          <button type="button" className="gt-button gt-button--secondary gt-button--sm" onClick={() => startEdit('new')} disabled={!!editing}>
            <span className="gt-button__icon"><ScheduleIcon name="calendar-plus" size={15} /></span>
            <span className="gt-button__label">Add meeting</span>
          </button>
        )}
      </div>
      {zoneNote && <p className="gt-tm__zone"><ScheduleIcon name="globe" size={13} />{zoneNote}</p>}
      {editing === 'new' && (
        <div className="gt-tm__new">
          <TeamMeetingForm
            mode="create"
            now={nowProp}
            zone={vz}
            schoolZone={schoolZone}
            saving={busy === 'new'}
            error={failed.new ? SAVE_ERROR : null}
            onSubmit={(value) => void save('new', value)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {body}
      <span className="gt-tm__sr" role="status" aria-live="polite">{announce}</span>
    </section>
  );
}

interface HeldRow {
  id: string;
  /** The row was in Past when its editor or confirm opened. */
  inPast: boolean;
}

/** The meetings split, with a held row put back in the list it was held in if the clock has moved it. */
function holdRow(split: { upcoming: TeamMeeting[]; past: TeamMeeting[] }, hold: HeldRow | null) {
  if (!hold) return split;
  const moved = (hold.inPast ? split.upcoming : split.past).find((m) => m.id === hold.id);
  if (!moved) return split;
  const start = (m: TeamMeeting): number => new Date(m.startsAt).getTime();
  const insert = (list: TeamMeeting[], goesBefore: (m: TeamMeeting) => boolean): TeamMeeting[] => {
    const i = list.findIndex(goesBefore);
    return i === -1 ? [...list, moved] : [...list.slice(0, i), moved, ...list.slice(i)];
  };
  // Upcoming runs soonest first, Past most recent first.
  return hold.inPast
    ? { upcoming: split.upcoming.filter((m) => m !== moved), past: insert(split.past, (m) => start(m) < start(moved)) }
    : { upcoming: insert(split.upcoming, (m) => start(m) > start(moved)), past: split.past.filter((m) => m !== moved) };
}

/** "Couldn’t load team meetings." with a Try again link: a quiet line, never a red panel. */
function LoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <p className="gt-tm__state gt-tm__state--error">
      Couldn’t load team meetings.
      <button type="button" className="gt-tm__link" onClick={onRetry}><ScheduleIcon name="refresh-cw" size={13} />Try again</button>
    </p>
  );
}

interface ConfirmRowProps {
  meeting: TeamMeeting;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The inline "Delete '…'?" strip that stands in for a row. Focus starts on Cancel; Escape cancels. */
function ConfirmRow({ meeting, busy, error, onConfirm, onCancel }: ConfirmRowProps) {
  const uid = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key !== 'Escape') return;
    // The Edit Project modal closes on an Escape that reaches the document: this one only cancels the delete.
    e.stopPropagation();
    e.preventDefault();
    if (!busy) onCancel();
  };
  return (
    <li className="gt-tm-row gt-tm-row--confirm" role="group" aria-labelledby={`${uid}-q`} onKeyDown={onKeyDown}>
      <span className="gt-tm-row__tile gt-tm-row__tile--alert"><ScheduleIcon name="circle-alert" size={16} /></span>
      <div className="gt-tm-row__main">
        <p id={`${uid}-q`} className="gt-tm-row__confirm-text">Delete '{meeting.title}'? It disappears from your team's calendars.</p>
        {error && <p className="gt-tm-row__error" role="alert">{error}</p>}
      </div>
      <div className="gt-tm-row__actions">
        <button
          type="button"
          className={['gt-button', 'gt-button--danger', 'gt-button--sm', busy ? 'gt-button--loading' : ''].filter(Boolean).join(' ')}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={onConfirm}
        >
          {busy && <span className="gt-button__spinner" aria-hidden="true" />}
          <span className="gt-button__label">Delete</span>
        </button>
        <button ref={cancelRef} type="button" className="gt-button gt-button--secondary gt-button--sm" onClick={onCancel} disabled={busy}>
          <span className="gt-button__label">Cancel</span>
        </button>
      </div>
    </li>
  );
}

/** One loading row of the card: time block, tile, two lines. */
function CardSkeleton() {
  return (
    <div className="gt-tm__skeleton gt-tm__skeleton--card">
      <Skeleton width={44} height={12} />
      <Skeleton width={24} height={24} radius={7} />
      <div className="gt-tm__skeleton-lines"><Skeleton width="55%" height={12} /><Skeleton width="35%" height={10} /></div>
    </div>
  );
}
