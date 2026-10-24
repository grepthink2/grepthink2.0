import React from 'react';
import { Badge } from '../display/Badge.jsx';
import { CountBadge } from '../display/CountBadge.jsx';
import { Button } from '../primitives/Button.jsx';
import { IconButton } from '../primitives/IconButton.jsx';
import { Popover } from '../feedback/Popover.jsx';
import { Menu, MenuItem } from '../feedback/Menu.jsx';
import { FinalReviewsIcon } from './FinalReviewsIcon.jsx';

function TeamMenu({ team, onAction }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onClose={() => setOpen(false)} placement="bottom" align="end" padded={false}
      anchor={<IconButton size="sm" ariaLabel={`More actions for ${team.name}`} aria-haspopup="menu" aria-expanded={open} tooltip="More actions" onClick={() => setOpen((o) => !o)}><FinalReviewsIcon name="ellipsis" size={16} /></IconButton>}>
      <Menu ariaLabel={`Actions for ${team.name}`} autoFocus onClose={() => setOpen(false)}>
        <MenuItem icon={<FinalReviewsIcon name="user-plus" size={16} />} onSelect={() => { setOpen(false); onAction('review_ta', team); }}>
          {team.review_ta ? 'Change Review TA…' : 'Appoint Review TA…'}
        </MenuItem>
      </Menu>
    </Popover>
  );
}

/**
 * Staff: the teams that hold no slot, each with its Product Owner (or the amber "No Product Owner"),
 * its Home TA and any Review TA the instructor appointed ahead of the booking. The instructor places
 * a team from here (Place on a slot…) or appoints its Review TA (Menu). Students never get this list.
 */
export function UnbookedTeams({ teams = [], lens = 'ta', complete = false, onAction, busy = null, headingLevel: H = 'h2', className = '' }) {
  const inst = lens === 'instructor' && !complete;
  const id = React.useId();
  return (
    <section className={['gt-fr-unbooked', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-h`}>
      <div className="gt-fr-unbooked__head">
        <H className="gt-fr-unbooked__title" id={`${id}-h`}>Teams without a slot</H>
        <CountBadge count={teams.length} label={`${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`} />
      </div>
      {teams.length === 0 ? (
        <p className="gt-fr-unbooked__quiet">Every team has a slot.</p>
      ) : (
        <>
          <p className="gt-fr-unbooked__hint">{inst ? 'Each team’s Product Owner books its slot, or you place the team.' : 'Each team’s Product Owner books its slot.'}</p>
          <ul className="gt-fr-unbooked__list">
            {teams.map((t) => (
              <li key={t.project_id} className="gt-fr-unbooked__row">
                <div className="gt-fr-unbooked__main">
                  <span className="gt-fr-unbooked__name">{t.name}</span>
                  <span className="gt-fr-unbooked__meta">
                    {t.product_owner
                      ? <span className="gt-fr-person"><span className="gt-fr-person__role">Product Owner</span><span className="gt-fr-person__who">{t.product_owner.name}</span></span>
                      : <Badge status="review.no_product_owner" />}
                    <span className={['gt-fr-person', t.home_ta ? '' : 'gt-fr-person--none'].filter(Boolean).join(' ')}><span className="gt-fr-person__role">Home TA</span><span className="gt-fr-person__who">{t.home_ta ? t.home_ta.name : 'None yet'}</span></span>
                    {t.review_ta && <span className="gt-fr-person"><span className="gt-fr-person__role">Review TA</span><span className="gt-fr-person__who">{t.review_ta.name}</span></span>}
                  </span>
                </div>
                {inst && (
                  <div className="gt-fr-unbooked__actions">
                    <Button size="sm" variant="secondary" loading={!!(busy && busy.teamId === t.project_id)} loadingLabel="Placing…"
                      aria-label={`Place ${t.name} on a slot`} onClick={() => onAction && onAction('place_on_slot', t)}>Place on a slot…</Button>
                    <TeamMenu team={t} onAction={(a, team) => onAction && onAction(a, team)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
