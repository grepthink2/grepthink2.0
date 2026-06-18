import React from 'react';
import type { LucideIcon } from 'lucide-react';
import './DashboardMetricCard.scss';

export type MetricAccent = 'primary' | 'blue' | 'purple' | 'amber';

interface DashboardMetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  accent?: MetricAccent;
  hint?: string;
  loading?: boolean;
  onClick?: () => void;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  label,
  value,
  icon: Icon,
  accent = 'primary',
  hint,
  loading = false,
  onClick,
}) => {
  const className = `metric-card metric-card--${accent}${
    onClick ? ' metric-card--clickable' : ''
  }`;

  const content = (
    <>
      <div className="metric-card__top">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon" aria-hidden>
          <Icon size={18} />
        </span>
      </div>
      <span className="metric-card__value">{loading ? '—' : value}</span>
      <span className="metric-card__hint">{hint ?? ' '}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
};

export default DashboardMetricCard;
