import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';
import { Button } from '../primitives/Button.jsx';
import { SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';
import { FinalReviewsModel } from './FinalReviewsModel.jsx';
import { SlotTime } from './SlotTime.jsx';
import { FinalReviewsIcon } from './FinalReviewsIcon.jsx';

const { slotPhase, isReviewJoinable, reviewCountdown } = FinalReviewsModel;
/* Built on render (no module-level JSX: bundle order never matters). */
const roleBadge = (role) => ({
  instructor: <Badge category="instructor" />,
  home: <Badge category="ta">You’re the Home TA</Badge>,
  review: <Badge category="ta">You’re the Review TA</Badge>,
  ta: <Badge category="ta">Read-only</Badge>,
}[role] || null);

/**
 * The header of the scoring workspace (/app/final-reviews/:projectId, staff): back to the board, the
 * team, the viewer's role, the review's day and time with the campus time when the zones differ (or
 * "No slot yet"), the Home TA and the Review TA (both score), and the shared Zoom room — a primary Join Zoom
 * inside the Join window for the Review TA and the instructor only: the Home TA doesn't sit in the review.
 * The body of the page (scores, notes) is not part of this design.
 */
export function ReviewWorkspaceHeader({
  team, viewerRole = 'ta', startsAt = null, homeTa = null, reviewTa = null, zoomUrl = null, now, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE,
  backHref = '/app/final-reviews', onBack, onJoin, className = '',
}) {
  const nowD = now || new Date();
  const phase = startsAt ? slotPhase(startsAt, nowD) : null;
  // the Review TA (and the instructor) sit in the review; the Home TA scores the team here but doesn't attend
  const joinable = (viewerRole === 'review' || viewerRole === 'instructor') && !!startsAt && isReviewJoinable(startsAt, nowD, zoomUrl);
  const cd = startsAt && phase === 'upcoming' ? reviewCountdown(startsAt, nowD, zone) : null;
  const person = (p, none) => (p ? <span className="gt-fr-ws__person"><Avatar size="xs" name={p.name} decorative />{p.name}</span> : <span className="gt-fr-ws__none">{none}</span>);
  return (
    <header className={['gt-fr-ws', className].filter(Boolean).join(' ')}>
      <Button variant="ghost" size="sm" href={backHref} onClick={onBack} iconLeft={<FinalReviewsIcon name="arrow-left" size={15} />} className="gt-fr-ws__back">All reviews</Button>
      <div className="gt-fr-ws__top">
        <div className="gt-fr-ws__heading">
          <h1 className="gt-fr-ws__title">{team ? team.name : 'Team review'}</h1>
          {roleBadge(viewerRole)}
          {phase === 'live' && <Badge status="live" />}
          {cd && <span className="gt-fr-ws__countdown">{cd}</span>}
        </div>
        {joinable && (
          <Button href={zoomUrl} target="_blank" rel="noreferrer" iconLeft={<FinalReviewsIcon name="video" size={16} />} onClick={onJoin} className="gt-fr-ws__join">Join Zoom</Button>
        )}
      </div>
      <dl className="gt-fr-ws__facts">
        <div className="gt-fr-ws__fact gt-fr-ws__fact--when">
          <dt>Review</dt>
          <dd>{startsAt ? <SlotTime startsAt={startsAt} zone={zone} schoolZone={schoolZone} withDay withDuration /> : <span className="gt-fr-ws__none">No slot yet</span>}</dd>
        </div>
        <div className="gt-fr-ws__fact"><dt>Home TA</dt><dd>{person(homeTa, 'None yet')}</dd></div>
        <div className="gt-fr-ws__fact"><dt>Review TA</dt><dd>{person(reviewTa, 'No Review TA yet')}</dd></div>
        <div className="gt-fr-ws__fact">
          <dt>Zoom</dt>
          <dd>{zoomUrl ? <a className="gt-fr-ws__link" href={zoomUrl} target="_blank" rel="noreferrer" onClick={onJoin}><FinalReviewsIcon name="video" size={14} />Shared Zoom room</a> : <span className="gt-fr-ws__none">Not set yet</span>}</dd>
        </div>
      </dl>
    </header>
  );
}
