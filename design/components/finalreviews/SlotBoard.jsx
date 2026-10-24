import React from 'react';
import { Button } from '../primitives/Button.jsx';
import { IconButton } from '../primitives/IconButton.jsx';
import { Alert } from '../feedback/Alert.jsx';
import { EmptyState, Skeleton } from '../feedback/EmptyState.jsx';
import { Popover } from '../feedback/Popover.jsx';
import { Menu, MenuItem } from '../feedback/Menu.jsx';
import { FilterChipGroup } from '../navigation/FilterChip.jsx';
import { ScheduleDayHeader } from '../schedule/ScheduleDayHeader.jsx';
import { SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';
import { SlotRow } from './SlotRow.jsx';
import { FinalReviewsIcon } from './FinalReviewsIcon.jsx';

const { groupSlots, slotView, matchesFilter, boardFilters, indexTeams, historyRows, isStaffLens, fmtSlotWhen, zoneNote } = FinalReviewsModel;

const EMPTY_FILTER = { free: 'No free slots right now.', mine: 'You’re not the Review TA of any booked team.', no_review_ta: 'Every booked team has a Review TA.' };

function DayMenu({ group, label, onDayAction }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onClose={() => setOpen(false)} placement="bottom" align="end" padded={false}
      anchor={<IconButton size="sm" ariaLabel={`Actions for ${label}`} aria-haspopup="menu" aria-expanded={open} tooltip="Day actions" onClick={() => setOpen((o) => !o)}><FinalReviewsIcon name="ellipsis" size={16} /></IconButton>}>
      <Menu ariaLabel={`Actions for ${label}`} autoFocus onClose={() => setOpen(false)}>
        <MenuItem destructive icon={<FinalReviewsIcon name="trash-2" size={16} />} onSelect={() => { setOpen(false); onDayAction('delete_day', group); }}>
          Delete {group.free} free {group.free === 1 ? 'slot' : 'slots'}
        </MenuItem>
      </Menu>
    </Popover>
  );
}

function BoardSkeleton() {
  return (
    <div className="gt-fr-board__surface" role="status" aria-busy="true">
      <span className="gt-fr-board__sr">Loading slots</span>
      {[0, 1].map((d) => (
        <div key={d} className="gt-fr-board__day">
          <div className="gt-fr-board__skeleton-head"><Skeleton width={150} height={14} /></div>
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="gt-fr-board__skeleton-row">
              <Skeleton width={96} height={13} /><Skeleton width="60%" height={13} /><Skeleton width={84} height={28} radius={7} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The Final Reviews board — every slot in the class by day (the viewer's zone), one component for
 * every lens. Day jump links + a single-choice filter on top, sticky day headers, fully past days
 * folded behind "Past days (n)" while later days remain. States: loading (skeleton), refetching
 * (holds its frame, `aria-busy`), error (quiet text + Try again), no slots (instructor → Post slots),
 * a pre-slots class (staff: recorded times as read-only history).
 */
export function SlotBoard({
  data, schedule = null, lens = 'no_team', now, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE, viewerId = null, complete = false,
  status = 'ready', filter, defaultFilter = 'all', onFilterChange, alert, alertActions, onDismissAlert, busy = null, onAction, onDayAction,
  onRetry, onPostSlots, reviewHref, defaultPastOpen = false, className = '',
}) {
  const nowD = now || new Date();
  const [ownFilter, setOwnFilter] = React.useState(defaultFilter);
  const [pastOpen, setPastOpen] = React.useState(defaultPastOpen);
  const pastId = React.useId();
  const active = filter !== undefined ? filter : ownFilter;
  const setFilter = (f) => { if (filter === undefined) setOwnFilter(f); if (onFilterChange) onFilterChange(f); };

  if (status === 'loading' || !data) return <div className={['gt-fr-board', className].filter(Boolean).join(' ')}><BoardSkeleton /></div>;
  if (status === 'error') {
    return (
      <div className={['gt-fr-board', className].filter(Boolean).join(' ')}>
        <div className="gt-fr-board__surface gt-fr-board__surface--state">
          <EmptyState variant="error" title="Couldn’t load the final-review slots." onRetry={onRetry} />
        </div>
      </div>
    );
  }

  const staff = isStaffLens(lens);
  const student = !staff;
  const myTeam = student && lens !== 'preview' ? data.my_team || null : null;
  const teamsById = staff ? indexTeams(data, schedule) : {};
  const ctx = { lens, now: nowD, signupsOpen: !!data.signups_open, complete, myTeam, viewerId, teamsById, zoomUrl: staff ? data.review_zoom_url : null };
  const history = staff ? historyRows(data, schedule) : [];
  const slots = data.slots && data.slots.length ? data.slots : history;
  const note = zoneNote(zone, schoolZone, slots[0] ? slots[0].starts_at : nowD);
  const rowProps = { context: ctx, zone, schoolZone, onAction, busy, reviewHref };

  if (!slots.length) {
    const inst = lens === 'instructor';
    const title = complete ? 'No slots in this class' : 'No slots posted yet';
    const desc = complete ? 'This class didn’t use final-review slots.'
      : inst ? `Post the times teams can book — a few days of hourly starts at once. ${data.signups_open ? 'Sign-ups are open, so teams can book as soon as you post.' : 'Teams book once you open sign-ups.'}`
        : lens === 'ta' ? 'The instructor hasn’t posted the review times yet.' : 'Your instructor posts the times teams can book. They’ll show here.';
    return (
      <div className={['gt-fr-board', className].filter(Boolean).join(' ')}>
        <div className="gt-fr-board__surface gt-fr-board__surface--state">
          <EmptyState variant="card" icon={<FinalReviewsIcon name={inst ? 'calendar-plus' : 'clipboard-check'} size={20} />} title={title} description={desc} titleAs="h2"
            action={inst && !complete && onPostSlots ? <Button onClick={onPostSlots} iconLeft={<FinalReviewsIcon name="calendar-plus" size={16} />}>Post slots</Button> : undefined} />
        </div>
      </div>
    );
  }

  const groups = groupSlots(slots, { zone, now: nowD }).map((g) => {
    const views = g.slots.map((s) => ({ s, v: slotView(s, ctx) }));
    return { ...g, label: fmtSlotWhen(g.slots[0].starts_at, { zone, schoolZone }).day, shown: views.filter(({ v }) => matchesFilter(v, active)) };
  });
  const visible = groups.filter((g) => g.shown.length);
  const hasCurrent = visible.some((g) => !g.isPast);
  const past = hasCurrent ? visible.filter((g) => g.isPast) : [];
  const current = hasCurrent ? visible.filter((g) => !g.isPast) : visible;
  const filters = history.length ? null : boardFilters(lens, slots, ctx);

  const day = (g) => (
    <section key={g.key} className={['gt-fr-board__day', g.isPast ? 'gt-fr-board__day--past' : ''].filter(Boolean).join(' ')} id={`gt-fr-day-${g.key}`} aria-labelledby={`gt-fr-day-${g.key}-h`}>
      <div className="gt-fr-board__day-head">
        <ScheduleDayHeader dayKey={g.key} now={nowD} zone={zone} id={`gt-fr-day-${g.key}-h`}
          aside={history.length ? null : `${g.free ? `${g.free} free · ` : ''}${g.booked} booked`} />
        {lens === 'instructor' && !complete && g.free > 0 && onDayAction && <DayMenu group={g} label={g.label} onDayAction={onDayAction} />}
      </div>
      <ul className="gt-fr-board__list">{g.shown.map(({ s }) => <SlotRow key={s.id} slot={s} {...rowProps} />)}</ul>
    </section>
  );

  return (
    <div className={['gt-fr-board', `gt-fr-board--${lens}`, status === 'refetching' ? 'gt-fr-board--refetching' : '', className].filter(Boolean).join(' ')} aria-busy={status === 'refetching' || undefined}>
      {(filters || groups.length > 1) && (
        <div className="gt-fr-board__bar">
          {groups.length > 1 && (
            <nav className="gt-fr-board__days" aria-label="Jump to a day">
              {groups.map((g) => (
                <Button key={g.key} size="sm" variant="outline" href={`#gt-fr-day-${g.key}`} className="gt-fr-board__day-link">
                  {g.label}{!history.length && <span className="gt-fr-board__day-count">{g.isPast ? ' · past' : g.free ? ` · ${g.free} free` : ' · full'}</span>}
                </Button>
              ))}
            </nav>
          )}
          {filters && <FilterChipGroup type="single" size="sm" ariaLabel="Show" value={active} onChange={setFilter} options={filters} className="gt-fr-board__filter" />}
        </div>
      )}
      {alert && <Alert tone="warning" onDismiss={onDismissAlert} actions={alertActions} className="gt-fr-board__alert">{alert}</Alert>}
      {(note || history.length > 0) && (
        <p className="gt-fr-board__note">
          {note && <span className="gt-fr-board__zone"><FinalReviewsIcon name="globe" size={14} />{note}</span>}
          {history.length > 0 && <span>This class scheduled its reviews before slots existed. These are the times that were recorded; there are no slots to book.</span>}
        </p>
      )}
      <div className="gt-fr-board__surface">
        {past.length > 0 && (
          <div className="gt-fr-board__past">
            <div className="gt-fr-board__past-bar">
              <Button variant="ghost" size="sm" aria-expanded={pastOpen} aria-controls={pastId} onClick={() => setPastOpen((o) => !o)}
                iconLeft={<FinalReviewsIcon name="chevron-right" size={15} className="gt-fr-board__past-chev" />}>
                Past days ({past.length})
              </Button>
            </div>
            <div id={pastId} hidden={!pastOpen}>{pastOpen && past.map(day)}</div>
          </div>
        )}
        {current.map(day)}
        {!visible.length && <p className="gt-fr-board__quiet">{EMPTY_FILTER[active] || 'Nothing to show.'}</p>}
      </div>
    </div>
  );
}
