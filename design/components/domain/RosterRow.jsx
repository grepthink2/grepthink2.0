import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';

/**
 * Roster table row — avatar, name/email, role pill, team, actions.
 * Use inside <Table> via render props, or standalone in a list.
 */
export function RosterRow({
  name,
  email,
  role = 'member',
  team,
  status,
  statusTone = 'neutral',
  actions = null,
  onClick,
  className = '',
}) {
  return (
    <div
      className={['gt-roster-row', onClick ? 'gt-roster-row--clickable' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <Avatar name={name || email} size="md" />
      <div className="gt-roster-row__id">
        <span className="gt-roster-row__name">{name}</span>
        <span className="gt-roster-row__email">{email}</span>
      </div>
      <div className="gt-roster-row__meta">
        {team && <span className="gt-roster-row__team">{team}</span>}
        {status && <Badge tone={statusTone}>{status}</Badge>}
        <Badge role={role}>{role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
      </div>
      {actions && <div className="gt-roster-row__actions">{actions}</div>}
    </div>
  );
}
