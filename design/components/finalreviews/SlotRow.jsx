import React from 'react';
import { Badge } from '../display/Badge.jsx';
import { Button } from '../primitives/Button.jsx';
import { IconButton } from '../primitives/IconButton.jsx';
import { Popover } from '../feedback/Popover.jsx';
import { Menu, MenuItem, MenuSeparator } from '../feedback/Menu.jsx';
import { SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';
import { SlotTime } from './SlotTime.jsx';
import { FinalReviewsIcon } from './FinalReviewsIcon.jsx';

const { slotView, fmtSlotWhen, FR_REASONS } = FinalReviewsModel;

const BUSY = { book: 'Booking…', move_here: 'Moving…', release_own: 'Releasing…', sign_up: 'Signing up…', step_down: 'Stepping down…', place_team: 'Placing…' };
const MENU_ICON = { review_ta: 'user-plus', move_team: 'arrow-right-left', release_team: 'calendar-x' };

/** "Maya Chen" / "You" with its role label — names only on the board (avatars live in the cards). */
function Person({ person, role, you }) {
  return (
    <span className="gt-fr-person">
      <span className="gt-fr-person__role">{role}</span>
      <span className="gt-fr-person__who">{you ? 'You' : person.name}</span>
    </span>
  );
}

/**
 * One slot on the board: time (viewer's zone + campus time) · team or Free · reviewers (staff see the Home TA
 * and the Review TA; a student's own row shows only the Review TA, the one the team presents to) · the viewer's actions. The lens decides everything through
 * FinalReviewsModel.slotView; where an action isn't offered the reason is visible text.
 * The instructor's structural actions sit in a Menu per row (Popover + Menu, arrow keys, Esc).
 */
export function SlotRow({
  slot, context = {}, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE, onAction, busy = null, reviewHref,
  as: Tag = 'li', className = '',
}) {
  const v = slotView(slot, context);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const w = fmtSlotWhen(slot.starts_at, { zone, schoolZone, minutes: v.minutes });
  const name = v.team ? v.team.name : null;
  const at = `${w.day} · ${w.start}`;
  const act = (a, e) => { if (onAction) onAction(a.id, slot, v, e); };
  const people = v.showPeople && (
    <span className="gt-fr-slot__people-list">
      {v.staff && (v.homeTa ? <Person person={v.homeTa} role="Home TA" you={v.viewerIsHome} /> : <span className="gt-fr-person gt-fr-person--none"><span className="gt-fr-person__role">Home TA</span><span className="gt-fr-person__who">None yet</span></span>)}
      {v.reviewTa ? <Person person={v.reviewTa} role="Review TA" you={v.viewerIsReview} /> : v.staff ? <Badge status="review.no_review_ta" /> : <span className="gt-fr-person gt-fr-person--none"><span className="gt-fr-person__role">Review TA</span><span className="gt-fr-person__who">None yet</span></span>}
    </span>
  );
  const label = (a) => ({
    book: `Book ${at}`, move_here: `Move here: ${at}`, release_own: `Release your team’s slot, ${at}`,
    sign_up: `Sign up to review ${name}`, step_down: `Step down as ${name}’s Review TA`, open_review: `Open review for ${name}`,
    join: `Join Zoom for ${name}`, place_team: `Place a team on ${at}`,
  }[a.id]);
  const cls = ['gt-fr-slot', `gt-fr-slot--${v.phase}`, v.team ? 'gt-fr-slot--held' : 'gt-fr-slot--free', v.mine ? 'gt-fr-slot--mine' : '',
    v.staff ? 'gt-fr-slot--staff' : '', slot.history ? 'gt-fr-slot--history' : '', className].filter(Boolean).join(' ');

  return (
    <Tag className={cls} id={`gt-fr-slot-${slot.id}`} aria-current={v.phase === 'live' && v.team ? 'true' : undefined}>
      <div className="gt-fr-slot__time"><SlotTime startsAt={slot.starts_at} minutes={v.minutes} zone={zone} schoolZone={schoolZone} /></div>
      <div className="gt-fr-slot__team">
        <span className="gt-fr-slot__head">
          {name && <span className="gt-fr-slot__name">{name}</span>}
          {v.badges.map((k) => <Badge key={k} status={k} />)}
        </span>
        {!v.staff && people}
      </div>
      {v.staff && <div className="gt-fr-slot__people">{people}</div>}
      <div className="gt-fr-slot__actions">
        {v.note && <span className="gt-fr-slot__note">{FR_REASONS[v.note]}</span>}
        {v.actions.map((a) => {
          if (a.id === 'delete') {
            return (
              <IconButton key="delete" size="sm" variant="danger" ariaLabel={`Delete the ${at} slot`} tooltip="Delete slot" onClick={(e) => act(a, e)}>
                <FinalReviewsIcon name="trash-2" size={16} />
              </IconButton>
            );
          }
          const isBusy = !!(busy && busy.slotId === slot.id && busy.action === a.id);
          const href = a.id === 'join' ? a.href : a.id === 'open_review' && reviewHref ? reviewHref(v.team) : undefined;
          return (
            <Button key={a.id} size="sm" variant={a.variant} href={href} target={a.id === 'join' ? '_blank' : undefined} rel={a.id === 'join' ? 'noreferrer' : undefined}
              loading={isBusy} loadingLabel={BUSY[a.id]} aria-label={label(a)}
              iconLeft={a.id === 'join' ? <FinalReviewsIcon name="video" size={15} /> : undefined}
              iconRight={a.id === 'open_review' ? <FinalReviewsIcon name="chevron-right" size={15} /> : undefined}
              onClick={(e) => act(a, e)}>
              {a.label}
            </Button>
          );
        })}
        {v.menu.length > 0 && (
          <Popover open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom" align="end" padded={false}
            anchor={(
              <IconButton size="sm" ariaLabel={`More actions for ${name}`} aria-haspopup="menu" aria-expanded={menuOpen} tooltip="More actions"
                onClick={() => setMenuOpen((o) => !o)}>
                <FinalReviewsIcon name="ellipsis" size={16} />
              </IconButton>
            )}>
            <Menu ariaLabel={`Actions for ${name}`} autoFocus onClose={() => setMenuOpen(false)}>
              {v.menu.map((m) => (
                <React.Fragment key={m.id}>
                  {m.destructive && <MenuSeparator />}
                  <MenuItem destructive={!!m.destructive} icon={<FinalReviewsIcon name={MENU_ICON[m.id]} size={16} />} onSelect={() => { setMenuOpen(false); act(m); }}>{m.label}</MenuItem>
                </React.Fragment>
              ))}
            </Menu>
          </Popover>
        )}
      </div>
    </Tag>
  );
}
