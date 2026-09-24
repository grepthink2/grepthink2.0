import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';

/**
 * Team member card — avatar, name, role pill, optional skills and
 * contact/actions row. Used in project Team tabs and TA views.
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
        <Badge role={role}>{role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
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

/**
 * Role select — the member-card dropdown for changing a project role.
 */
export function RoleSelect({ value = 'member', onChange, disabled = false, className = '' }) {
  const ROLES = [
    { value: 'owner', label: 'Owner' },
    { value: 'product_owner', label: 'Product Owner' },
    { value: 'scrum_master', label: 'Scrum Master' },
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
  ];
  return (
    <div className={['gt-role-select', className].filter(Boolean).join(' ')}>
      <select
        className="gt-role-select__control"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={disabled}
        aria-label="Project role"
      >
        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <svg className="gt-role-select__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
