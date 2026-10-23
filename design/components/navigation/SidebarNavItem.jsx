import React from 'react';
import { UnreadBadge } from '../display/UnreadBadge.jsx';

/**
 * Sidebar navigation item — white text on the green sidebar; active state is the light chip with
 * the left half-pill indicator. The unread count is the shared UnreadBadge (red, "3 unread").
 * Rendered inside the app sidebar (layout code), its one consumer.
 */
export function SidebarNavItem({ icon = null, label, active = false, badge, collapsed = false, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={['gt-sidebar-item', active ? 'gt-sidebar-item--active' : '', collapsed ? 'gt-sidebar-item--collapsed' : '', className].filter(Boolean).join(' ')}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
    >
      {icon && <span className="gt-sidebar-item__icon" aria-hidden="true">{icon}</span>}
      {!collapsed && <span className="gt-sidebar-item__label">{label}</span>}
      {!collapsed && badge != null && badge !== 0 && <UnreadBadge count={badge} className="gt-sidebar-item__badge" />}
    </button>
  );
}

/** Uppercase section title used between sidebar groups. */
export function SidebarSectionTitle({ children }) {
  return <p className="gt-sidebar-section-title">{children}</p>;
}
