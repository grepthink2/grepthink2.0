import React from 'react';

/**
 * The one unread pill (sidebar, header bell, conversation list, message widget): solid red,
 * white bold count, accessible text built in ("3 unread"). Promoted from domain/ConversationListItem.
 */
export function UnreadBadge({ count = 0, max = 99, label, dot = false, className = '' }) {
  if (!count) return null;
  const shown = count > max ? `${max}+` : count;
  return (
    <span className={['gt-unread', dot ? 'gt-unread--dot' : '', className].filter(Boolean).join(' ')}>
      {!dot && <span aria-hidden="true">{shown}</span>}
      <span className="gt-visually-hidden">{label || `${count} unread`}</span>
    </span>
  );
}
