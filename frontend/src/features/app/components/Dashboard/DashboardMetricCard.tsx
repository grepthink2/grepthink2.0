import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import StatTooltip from '@features/app/components/Project/Assign/StatTooltip';
import './DashboardMetricCard.scss';

export type MetricAccent = 'primary' | 'blue' | 'purple' | 'amber';

interface DashboardMetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  accent?: MetricAccent;
  hint?: string;
  tooltip?: string;
  loading?: boolean;
  onClick?: () => void;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  label,
  value,
  icon: Icon,
  accent = 'primary',
  hint,
  tooltip,
  loading = false,
  onClick,
}) => {
  const className = `metric-card metric-card--${accent}${
    onClick ? ' metric-card--clickable' : ''
  }`;

  const content = (
    <>
      <div className="metric-card__top">
        <span className="metric-card__label">
          {tooltip ? <StatTooltip label={tooltip} underline>{label}</StatTooltip> : label}
        </span>
        <span className="metric-card__icon" aria-hidden>
          <Icon size={18} />
        </span>
      </div>
      <span className="metric-card__value">
        {loading ? <Skeleton width={56} height="1.6rem" /> : value}
      </span>
      {(loading || hint) && (
        <span className="metric-card__hint">
          {loading ? <Skeleton width="70%" height={11} /> : hint}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-busy={loading || undefined}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
};

export default DashboardMetricCard;
