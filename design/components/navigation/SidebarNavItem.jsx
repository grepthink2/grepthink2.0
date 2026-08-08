import React from 'react';

/**
 * Sidebar navigation item — white text on the green sidebar; active
 * state is the light chip with the left half-pill indicator.
 * Must be rendered inside a green (.gt-sidebar-demo or app sidebar) container.
 */
export function SidebarNavItem({ icon = null, label, active = false, badge, collapsed = false, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={[
        'gt-sidebar-item',
        active ? 'gt-sidebar-item--active' : '',
        collapsed ? 'gt-sidebar-item--collapsed' : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {icon && <span className="gt-sidebar-item__icon">{icon}</span>}
      {!collapsed && <span className="gt-sidebar-item__label">{label}</span>}
      {!collapsed && badge != null && badge !== 0 && <span className="gt-sidebar-item__badge">{badge}</span>}
    </button>
  );
}

/** Uppercase section title used between sidebar groups. */
export function SidebarSectionTitle({ children }) {
  return <p className="gt-sidebar-section-title">{children}</p>;
}
