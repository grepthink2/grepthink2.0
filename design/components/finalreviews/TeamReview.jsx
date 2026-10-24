import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';
import { Button } from '../primitives/Button.jsx';
import { EmptyState, Skeleton } from '../feedback/EmptyState.jsx';
import { SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';
import { SlotTime } from './SlotTime.jsx';
import { FinalReviewsIcon } from './FinalReviewsIcon.jsx';

const { teamReviewState, teamReviewCopy, poCanChange, reviewCountdown, slotPhase } = FinalReviewsModel;
const BOOKED = ['booked', 'booked_closed', 'joinable', 'live', 'past'];

function Fact({ label, children }) {
  return <div className="gt-fr-team__fact"><dt>{label}</dt><dd>{children}</dd></div>;
}
function PersonFact({ person, label, role, none }) {
  return (
    <Fact label={label}>
      {person ? <span className="gt-fr-team__person"><Avatar size="xs" name={person.name} decorative />{person.name}{role && <span className="gt-fr-team__role">· {role}</span>}</span> : <span className="gt-fr-team__none">{none}</span>}
    </Fact>
  );
}

/**
 * "Your team's review" — the student's own booking, at the top of the board (`variant="page"`) and as
 * the body of the project page's "Final review" card (`variant="card"`). One component for every
 * state (FinalReviewsModel.teamReviewState): the call to book (Product Owner), who books (member), no
 * Product Owner, sign-ups closed, every slot taken, booked (time with campus time, countdown, the Review TA
 * the team presents to — the Home TA scores the team but isn't in the review, so it isn't named here —
 * the shared Zoom room, Change slot / Release or the reason they're unavailable), the Join
 * window, live, past, and on no team. The student never sees another team's reviewers here.
 */
export function TeamReview({
  variant = 'page', myTeam = null, slots = [], signupsOpen = false, complete = false, now, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE,
  status = 'ready', onChooseSlot, onChangeSlot, onRelease, onJoin, onRetry, boardHref, busy = null, headingLevel, className = '',
}) {
  const nowD = now || new Date();
  const id = React.useId();
  const card = variant === 'card';
  const H = headingLevel || (card ? 'h3' : 'h2');
  const base = ['gt-fr-team', `gt-fr-team--${variant}`];
  if (status === 'loading') {
    return (
      <div className={[...base, 'gt-fr-team--loading', className].filter(Boolean).join(' ')} role="status" aria-busy="true">
        <span className="gt-fr-team__tile"><Skeleton width={card ? 32 : 40} height={card ? 32 : 40} radius={10} /></span>
        <div className="gt-fr-team__body"><Skeleton width="55%" height={15} /><Skeleton width="80%" height={12} /><Skeleton width="40%" height={12} /></div>
        <span className="gt-fr-team__sr">Loading your team’s review</span>
      </div>
    );
  }
  if (status === 'error') {
    return <div className={[...base, className].filter(Boolean).join(' ')}><EmptyState variant="error" title="Couldn’t load your team’s review." onRetry={onRetry} /></div>;
  }

  const state = teamReviewState({ myTeam, slots, signupsOpen, complete, now: nowD });
  const freeCount = slots.filter((s) => !s.team && slotPhase(s.starts_at, nowD) === 'upcoming').length;
  const copy = teamReviewCopy(state, { myTeam, freeCount, variant, zone, schoolZone });
  const booked = BOOKED.includes(state);
  const po = !!(myTeam && myTeam.is_product_owner);
  const change = poCanChange({ myTeam, signupsOpen, complete, now: nowD });
  const cd = booked && state !== 'past' && state !== 'live' ? reviewCountdown(myTeam.starts_at, nowD, zone) : null;
  const joinable = state === 'joinable' || (state === 'live' && !!myTeam.zoom_url);

  const actions = [];
  if (joinable) {
    actions.push(<Button key="join" href={myTeam.zoom_url} target="_blank" rel="noreferrer" size={card ? 'sm' : 'md'} iconLeft={<FinalReviewsIcon name="video" size={16} />} onClick={onJoin} fullWidth={card}>Join Zoom</Button>);
  } else if (state === 'book') {
    actions.push(card && boardHref
      ? <Button key="choose" href={boardHref} size="sm" fullWidth iconRight={<FinalReviewsIcon name="chevron-right" size={15} />}>Choose a slot</Button>
      : <Button key="choose" size={card ? 'sm' : 'md'} onClick={onChooseSlot} fullWidth={card}>Choose a slot</Button>);
  } else if (state === 'booked' && po && change.ok) {
    actions.push(
      card && boardHref
        ? <Button key="change" href={boardHref} size="sm" variant="secondary">Change slot</Button>
        : <Button key="change" size={card ? 'sm' : 'md'} variant="secondary" onClick={onChangeSlot}>Change slot</Button>,
      <Button key="release" size={card ? 'sm' : 'md'} variant="danger-ghost" onClick={onRelease} loading={busy === 'release'} loadingLabel="Releasing…">Release</Button>,
    );
  }
  const lockNote = booked && po && !change.ok && state !== 'past' ? (change.reason === 'time_passed' ? copy.passed : copy.locked) : null;

  return (
    <section className={[...base, `gt-fr-team--${state}`, booked ? 'gt-fr-team--booked-like' : '', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-t`}>
      <span className="gt-fr-team__tile" aria-hidden="true"><FinalReviewsIcon name={booked ? 'clipboard-check' : state === 'no_team' ? 'users' : 'calendar-clock'} size={card ? 16 : 20} /></span>
      <div className="gt-fr-team__body">
        <div className={['gt-fr-team__head', card && booked ? 'gt-fr-team__head--sr' : ''].filter(Boolean).join(' ')}>
          <H className="gt-fr-team__title" id={`${id}-t`}>{copy.title}</H>
          {!card && state === 'live' && <Badge status="live" />}
          {!card && cd && <span className="gt-fr-team__countdown">{cd}</span>}
        </div>
        {booked ? (
          <>
            <p className="gt-fr-team__when">
              <SlotTime startsAt={myTeam.starts_at} zone={zone} schoolZone={schoolZone} withDay dayFormat={card ? 'short' : 'long'} withDuration={!card} />
              {card && state === 'live' && <Badge status="live" />}
              {card && cd && <span className="gt-fr-team__countdown">{cd}</span>}
            </p>
            {state === 'past' ? <p className="gt-fr-team__text">{copy.body}</p> : (
              <dl className="gt-fr-team__facts">
                <PersonFact label="Your team presents to" person={myTeam.review_ta} role="Review TA" none={copy.noReviewTa} />
                <Fact label="Zoom">
                  {myTeam.zoom_url
                    ? <a className="gt-fr-team__link" href={myTeam.zoom_url} target="_blank" rel="noreferrer" onClick={onJoin}><FinalReviewsIcon name="video" size={14} />Shared Zoom room</a>
                    : <span className="gt-fr-team__none">{copy.noZoom}</span>}
                </Fact>
              </dl>
            )}
            {lockNote && <p className="gt-fr-team__note"><FinalReviewsIcon name="lock" size={14} />{lockNote}</p>}
          </>
        ) : (
          <p className="gt-fr-team__text">{copy.body}</p>
        )}
      </div>
      {actions.length > 0 && <div className="gt-fr-team__actions">{actions}</div>}
    </section>
  );
}
