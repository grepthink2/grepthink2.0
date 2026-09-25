import React from 'react';

/**
 * Status/role pill. Soft background + colored text, fully rounded —
 * matches the app's .status-badge idiom.
 * `tone` presets cover statuses; `role` presets cover project roles.
 */
const TONES = ['neutral', 'success', 'warning', 'error', 'info', 'gold'];
const ROLES = ['owner', 'product_owner', 'scrum_master', 'admin', 'member'];

export function Badge({ children, tone = 'neutral', role, solid = false, className = '', ...rest }) {
  const kind = role ? `role-${role}` : tone;
  const cls = [
    'gt-badge',
    `gt-badge--${kind}`,
    solid ? 'gt-badge--solid' : '',
    className,
  ].filter(Boolean).join(' ');
  return <span className={cls} {...rest}>{children}</span>;
}

Badge.tones = TONES;
Badge.roles = ROLES;
