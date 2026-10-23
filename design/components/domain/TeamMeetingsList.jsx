import React from 'react';
import { Button } from '../primitives/Button.jsx';
import { Badge } from '../display/Badge.jsx';
import { Alert } from '../feedback/Alert.jsx';
import { InlineConfirm } from '../feedback/ConfirmDialog.jsx';
import { Skeleton } from '../feedback/EmptyState.jsx';
import { ScheduleItem, ScheduleIcon } from '../schedule/ScheduleItem.jsx';
import { ScheduleDayHeader } from '../schedule/ScheduleDayHeader.jsx';
import { ScheduleModel, SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { TeamMeetingForm } from './TeamMeetingForm.jsx';
import { TeamMeetingsModel } from './TeamMeetingsModel.jsx';

const { viewerZone, zoneDiffers, zoneLabel, groupByDay, fmtTimeRange } = ScheduleModel;
const { splitMeetings, isLive, toScheduleItem, fmtMeetingWhen, fmtMinutes, isoMinutes, endsAtOf } = TeamMeetingsModel;

/** Ticking clock — ScheduleModel.useNow in production; a local copy keeps the kit working on an older bundle. */
function useClock(ms = 30000, fixed) {
  const fixedMs = fixed ? new Date(fixed).getTime() : null;
  const [now, setNow] = React.useState(() => (fixedMs != null ? new Date(fixedMs) : new Date()));
  React.useEffect(() => {
    if (fixedMs != null) { setNow(new Date(fixedMs)); return undefined; }
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms, fixedMs]);
  return fixedMs != null && now.getTime() !== fixedMs ? new Date(fixedMs) : now;
}
const useNow = ScheduleModel.useNow || useClock;

const SAVE_ERROR = 'Couldn’t save this meeting. Your changes are still here — try again.';
const DELETE_ERROR = 'Couldn’t delete. Try again.';

/**
 * A team's one-off meetings.
 * `variant="manage"` — the Edit Project → Meetings tab (Product Owner only): upcoming first, "Past (n)" collapsed,
 *   Edit / Delete per row, "Add meeting" opens TeamMeetingForm above the list, Edit replaces the row with it,
 *   Delete confirms inline. One editor at a time.
 * `variant="card"` — the project-page "Team meetings" card body for every member: upcoming meetings as compact
 *   ScheduleItem rows (kind meeting) grouped by day, "Past meetings (n)" collapsed. Returns a quiet "Add one" line
 *   for the Product Owner when there are none; `showTeamMeetingsCard()` tells the page whether to render the card at all.
 */
export function TeamMeetingsList({
  variant = 'manage', meetings = [], status = 'ready', now: nowProp, zone, schoolZone = SCHOOL_ZONE, canManage = false,
  teamName, people = {}, onCreate, onUpdate, onDelete, onRetry, onManage, onJoin, scheduleHref = '/app/schedule', maxUpcoming = 5,
  defaultEditingId = null, defaultConfirmId = null, defaultPastOpen = false, className = '',
}) {
  const now = useNow(30000, nowProp);
  const vz = zone || viewerZone();
  const [editing, setEditing] = React.useState(defaultEditingId);   // 'new' | id | null
  const [confirmId, setConfirmId] = React.useState(defaultConfirmId);
  const [pastOpen, setPastOpen] = React.useState(defaultPastOpen);
  const [busy, setBusy] = React.useState(null);                     // 'new' | id | `del:${id}`
  const [errors, setErrors] = React.useState({});
  const [announce, setAnnounce] = React.useState('');
  const uid = React.useId();

  const { upcoming, past } = splitMeetings(meetings, now);
  const differs = zoneDiffers(vz, schoolZone, now);
  const zoneNote = differs ? `Times in ${zoneLabel(vz, now)} · campus is ${zoneLabel(schoolZone, now)}` : null;
  const campusRange = (m) => (differs ? `${fmtTimeRange({ startsAt: m.startsAt, endsAt: endsAtOf(m) }, schoolZone)} ${zoneLabel(schoolZone, m.startsAt)}` : undefined);

  const run = async (key, fn, done) => {
    setBusy(key); setErrors((e) => ({ ...e, [key]: null }));
    try { await fn(); done(); } catch (err) { setErrors((e) => ({ ...e, [key]: true })); } finally { setBusy(null); }
  };
  const save = (key, value) => run(key, () => (key === 'new' ? onCreate && onCreate(value) : onUpdate && onUpdate(key, value)), () => { setEditing(null); setAnnounce(key === 'new' ? 'Meeting added.' : 'Meeting saved.'); });
  const remove = (m) => run(`del:${m.id}`, () => onDelete && onDelete(m.id), () => { setConfirmId(null); setAnnounce('Meeting deleted.'); });
  const startEdit = (id) => { setConfirmId(null); setEditing(id); };
  const cls = ['gt-tm', `gt-tm--${variant}`, className].filter(Boolean).join(' ');

  /* ── card: compact ScheduleItem rows grouped by day ─────────────────────────────────────── */
  if (variant === 'card') {
    if (status === 'loading') return <div className={cls} role="status" aria-busy="true" aria-label="Loading team meetings">{[0, 1].map((i) => <CardSkeleton key={i} />)}</div>;
    if (status === 'error') return <div className={cls}><p className="gt-tm__state gt-tm__state--error">Couldn’t load team meetings.<button type="button" className="gt-tm__link" onClick={onRetry}><ScheduleIcon name="refresh-cw" size={13} />Try again</button></p></div>;
    if (!upcoming.length && !past.length) {
      return canManage ? <div className={cls}><p className="gt-tm__quiet">No team meetings yet. <button type="button" className="gt-tm__link" onClick={onManage}>Add one</button></p></div> : null;
    }
    const shown = upcoming.slice(0, maxUpcoming), more = upcoming.length - shown.length;
    const toItem = (m) => toScheduleItem(m, { teamName, people });
    const rows = (list) => groupByDay(list.map(toItem), { zone: vz, now }).map((g) => (
      <React.Fragment key={g.key}>
        <ScheduleDayHeader dayKey={g.key} now={now} zone={vz} />
        <ol className="gt-sched__items">{g.items.map((it) => <ScheduleItem key={it.id} item={it} variant="compact" now={now} zone={vz} schoolZone={schoolZone} showSchoolTime={differs} onJoin={onJoin} />)}</ol>
      </React.Fragment>
    ));
    return (
      <div className={cls}>
        <div className="gt-sched gt-sched--compact">
          {shown.length ? rows(shown) : <p className="gt-tm__quiet">No upcoming meetings.</p>}
          {more > 0 && <p className="gt-tm__more"><a className="gt-tm__link" href={scheduleHref}>+{more} more · See all in Schedule<ScheduleIcon name="arrow-right" size={13} /></a></p>}
          {past.length > 0 && (
            <div className="gt-tm__past">
              <button type="button" className="gt-tm__past-toggle" aria-expanded={pastOpen} aria-controls={`${uid}-past`} onClick={() => setPastOpen(!pastOpen)}>
                <ScheduleIcon name="chevron-right" size={14} />Past meetings ({past.length})
              </button>
              {pastOpen && <div id={`${uid}-past`}>{rows(past)}</div>}
            </div>
          )}
          {zoneNote && <div className="gt-sched__footer"><span className="gt-sched__zone"><ScheduleIcon name="globe" size={13} />{zoneNote}</span></div>}
        </div>
      </div>
    );
  }

  /* ── manage: the Meetings tab ───────────────────────────────────────────────────────────── */
  const row = (m, isPastRow) => {
    if (editing === m.id) {
      return (
        <li key={m.id} className="gt-tm-row gt-tm-row--editing">
          <TeamMeetingForm mode="edit" meeting={m} now={now} zone={vz} schoolZone={schoolZone} saving={busy === m.id} error={errors[m.id] ? SAVE_ERROR : null}
            onSubmit={(value) => save(m.id, value)} onCancel={() => setEditing(null)} />
        </li>
      );
    }
    if (confirmId === m.id) {
      return <ConfirmRow key={m.id} meeting={m} busy={busy === `del:${m.id}`} error={errors[`del:${m.id}`] ? DELETE_ERROR : null} onConfirm={() => remove(m)} onCancel={() => setConfirmId(null)} />;
    }
    const when = fmtMeetingWhen(m, vz, now);
    const live = !isPastRow && isLive(m, now);
    return (
      <li key={m.id} className={['gt-tm-row', isPastRow ? 'gt-tm-row--past' : '', live ? 'gt-tm-row--live' : ''].filter(Boolean).join(' ')} aria-current={live ? 'true' : undefined}>
        <span className="gt-tm-row__tile"><ScheduleIcon name="users" size={16} /></span>
        <div className="gt-tm-row__main">
          <div className="gt-tm-row__head">
            <span className="gt-tm-row__title">{m.title}</span>
            {live && <Badge status="live" />}
          </div>
          <div className="gt-tm-row__when" title={campusRange(m)}>
            <time className="gt-tm-row__day" dateTime={m.startsAt}>{when.day}</time>
            <span className="gt-tm-row__sep" aria-hidden="true">·</span>
            <span className="gt-tm-row__range"><time dateTime={m.startsAt}>{when.start}</time> – <time dateTime={endsAtOf(m)}>{when.end}</time></span>
            <time className="gt-tm-row__dur" dateTime={isoMinutes(m.durationMinutes)}>{fmtMinutes(m.durationMinutes)}</time>
            {m.location && <span className="gt-tm-row__place"><ScheduleIcon name="map-pin" size={12} />{m.location}</span>}
            {m.zoomUrl && <a className="gt-tm-row__place gt-tm-row__place--link" href={m.zoomUrl} target="_blank" rel="noreferrer"><ScheduleIcon name="video" size={12} />Zoom</a>}
          </div>
          {m.note && <p className="gt-tm-row__note" title={m.note}>{m.note}</p>}
        </div>
        {canManage && (
          <div className="gt-tm-row__actions">
            <Button variant="ghost" size="sm" onClick={() => startEdit(m.id)} disabled={!!editing} aria-label={`Edit ${m.title}`}>Edit</Button>
            <Button variant="danger-ghost" size="sm" onClick={() => setConfirmId(m.id)} disabled={!!editing} aria-label={`Delete ${m.title}`}>Delete</Button>
          </div>
        )}
      </li>
    );
  };

  let body;
  if (status === 'loading') {
    body = <div role="status" aria-busy="true" aria-label="Loading team meetings">{[0, 1, 2].map((i) => <div key={i} className="gt-tm__skeleton"><Skeleton width={28} height={28} radius={7} /><div className="gt-tm__skeleton-lines"><Skeleton width="42%" height={12} /><Skeleton width="68%" height={10} /></div></div>)}</div>;
  } else if (status === 'error') {
    body = <Alert tone="error" title="Couldn’t load team meetings." actions={<Button variant="outline" size="sm" iconLeft={<ScheduleIcon name="refresh-cw" size={13} />} onClick={onRetry}>Try again</Button>} />;
  } else if (!meetings.length && editing !== 'new') {
    body = (
      <div className="gt-tm__empty">
        <span className="gt-tm__empty-icon"><ScheduleIcon name="calendar-days" size={18} /></span>
        <p className="gt-tm__empty-title">No team meetings yet</p>
        <p className="gt-tm__empty-hint">A design review, sprint planning, a sponsor demo — everyone on the team sees them in their schedule.</p>
        {canManage && <Button size="sm" iconLeft={<ScheduleIcon name="calendar-plus" size={15} />} onClick={() => startEdit('new')}>Add meeting</Button>}
      </div>
    );
  } else {
    body = (
      <>
        {upcoming.length > 0 && <ol className="gt-tm__list">{upcoming.map((m) => row(m, false))}</ol>}
        {!upcoming.length && meetings.length > 0 && editing !== 'new' && <p className="gt-tm__quiet">No upcoming meetings.</p>}
        {past.length > 0 && (
          <div className="gt-tm__past">
            <button type="button" className="gt-tm__past-toggle" aria-expanded={pastOpen} aria-controls={`${uid}-past`} onClick={() => setPastOpen(!pastOpen)}>
              <ScheduleIcon name="chevron-right" size={14} />Past ({past.length})
            </button>
            {pastOpen && <ol id={`${uid}-past`} className="gt-tm__list gt-tm__list--past">{past.map((m) => row(m, true))}</ol>}
          </div>
        )}
      </>
    );
  }

  const count = status === 'ready' && meetings.length ? `${upcoming.length} upcoming${past.length ? ` · ${past.length} past` : ''}` : null;
  return (
    <section className={cls} aria-label="Team meetings">
      <div className="gt-tm__head">
        <p className="gt-tm__hint">One-off meetings for the whole team. They show up in everyone’s schedule and calendar feed.{count && <span className="gt-tm__count">{count}</span>}</p>
        {canManage && status === 'ready' && meetings.length > 0 && (
          <Button size="sm" variant="secondary" iconLeft={<ScheduleIcon name="calendar-plus" size={15} />} onClick={() => startEdit('new')} disabled={!!editing}>Add meeting</Button>
        )}
      </div>
      {zoneNote && <p className="gt-tm__zone"><ScheduleIcon name="globe" size={13} />{zoneNote}</p>}
      {editing === 'new' && (
        <div className="gt-tm__new">
          <TeamMeetingForm mode="create" now={now} zone={vz} schoolZone={schoolZone} saving={busy === 'new'} error={errors.new ? SAVE_ERROR : null}
            onSubmit={(value) => save('new', value)} onCancel={() => setEditing(null)} />
        </div>
      )}
      {body}
      <span className="gt-tm__sr" role="status" aria-live="polite">{announce}</span>
    </section>
  );
}

function ConfirmRow({ meeting, busy, error, onConfirm, onCancel }) {
  // the shared InlineConfirm: focus lands on Cancel, Esc cancels inside the dialog, Delete shows "Deleting…"
  return (
    <li className="gt-tm__confirm">
      <InlineConfirm message={`Delete '${meeting.title}'? It disappears from your team's calendars.`} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  );
}

function CardSkeleton() {
  return <div className="gt-tm__skeleton gt-tm__skeleton--card"><Skeleton width={44} height={12} /><Skeleton width={24} height={24} radius={7} /><div className="gt-tm__skeleton-lines"><Skeleton width="55%" height={12} /><Skeleton width="35%" height={10} /></div></div>;
}
