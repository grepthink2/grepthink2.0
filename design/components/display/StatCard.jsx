import React from 'react';

/**
 * Dashboard metric card — uppercase label, big value, tinted icon chip.
 * Mirrors the app's DashboardMetricCard.
 */
export function StatCard({
  label,
  value,
  hint,
  icon = null,
  accent = 'primary',
  onClick,
  className = '',
  ...rest
}) {
  const El = onClick ? 'button' : 'div';
  return (
    <El
      className={['gt-stat-card', `gt-stat-card--${accent}`, onClick ? 'gt-stat-card--clickable' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      {...rest}
    >
      <div className="gt-stat-card__top">
        <span className="gt-stat-card__label">{label}</span>
        {icon && <span className="gt-stat-card__icon">{icon}</span>}
      </div>
      <span className="gt-stat-card__value">{value}</span>
      <span className="gt-stat-card__hint">{hint}</span>
    </El>
  );
}
