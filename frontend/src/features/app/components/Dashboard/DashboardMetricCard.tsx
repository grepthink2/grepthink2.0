import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import StatTooltip from '@features/app/components/Project/Assign/StatTooltip';
import { deltaPoints, signedPercent } from '@features/analytics/utils/analyticsFormat';
import './DashboardMetricCard.scss';

export type MetricAccent = 'primary' | 'blue' | 'purple' | 'amber';

/** A relative change against an earlier period; `value` is null when there is no baseline. */
export interface MetricDelta {
  value: number | null;
  vsLabel: string;
  goodWhenUp: boolean;
}

interface DashboardMetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  accent?: MetricAccent;
  hint?: string;
  tooltip?: string;
  loading?: boolean;
  onClick?: () => void;
  /** Optional, drawn under the value (not while loading); the class Dashboard passes none. */
  delta?: MetricDelta;
  /** Optional weekly history (not drawn while loading); fewer than two points draw no sparkline. */
  trend?: number[];
}

/** Toned by the figure shown (`deltaPoints`): no baseline ("—") and "0%" are flat, otherwise direction × goodWhenUp. */
function deltaTone({ value, goodWhenUp }: MetricDelta): string {
  const points = deltaPoints(value);
  if (points === null || points === 0) return 'metric-card__delta--flat';
  const up = points > 0;
  return up === goodWhenUp ? 'metric-card__delta--good' : 'metric-card__delta--bad';
}

/**
 * Weekly history (2 to 12 points) in de-emphasis gray; the last point is the green dot with a 2 px white ring
 * (brief §4 #2). Decorative: the tile's value and delta carry the text, and the Conversations week table holds the
 * weekly figures. Draws nothing below two points.
 */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 28;
  // Vertices sit 2 px inside w × h and the viewBox reaches 4 px further on every side, so an extreme vertex is 6 px
  // from the edge and the marker's ring (radius 4 + half its 2 px stroke = 5) is never clipped.
  const pad = 4;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (w - 4) + 2, h - 2 - ((p - min) / span) * (h - 4)] as const);
  const last = xy[xy.length - 1];
  return (
    <svg className="metric-card__spark" viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`} width={w + 2 * pad} height={h + 2 * pad} aria-hidden="true">
      <polyline className="metric-card__spark-line" points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" />
      <circle className="metric-card__spark-dot" cx={last[0]} cy={last[1]} r={4} />
    </svg>
  );
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
  delta,
  trend,
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
      {!loading && delta ? (
        <span className={`metric-card__delta ${deltaTone(delta)}`}>
          <span className="metric-card__delta-value">{signedPercent(delta.value)}</span>
          <span className="metric-card__delta-vs">{delta.vsLabel}</span>
        </span>
      ) : null}
      {!loading && trend ? <Sparkline points={trend} /> : null}
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
