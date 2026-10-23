import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';

/**
 * Team member card — avatar, name, role pill, optional skills and
 * contact/actions row. Used in project Team tabs and TA views. Roles are not changed from the
 * card: the Team tab picks a member per role (Product Owner, Scrum Master) with the kit Select
 * (RoleSelect left in the 2026-10-22 fold-back).
 */
export function TeamMemberCard({
  name,
  email,
  role = 'member',
  skills = [],
  actions = null,
  className = '',
}) {
  return (
    <div className={['gt-member-card', className].filter(Boolean).join(' ')}>
      <div className="gt-member-card__head">
        <Avatar name={name || email} size="lg" />
        <div className="gt-member-card__id">
          <span className="gt-member-card__name">{name}</span>
          {email && <span className="gt-member-card__email">{email}</span>}
        </div>
        <Badge projectRole={role} />
      </div>
      {skills.length > 0 && (
        <div className="gt-member-card__skills">
          {skills.map((s) => <span key={s} className="gt-tag gt-tag--neutral">{s}</span>)}
        </div>
      )}
      {actions && <div className="gt-member-card__actions">{actions}</div>}
    </div>
  );
}
