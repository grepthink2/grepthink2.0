import { H, W, seriesPoints } from '../utils/burnupGeometry';

interface Props {
  /** X labels — days within a sprint, or S1…Sn cumulatively. */
  labels: string[];
  /** Total scope at each step (steps up when scope grows). */
  scope: number[];
  /** Completed points at each step. */
  completed: number[];
  height?: number;
  title?: string;
  subtitle?: string | null;
}

/**
 * Burnup — completed points (green line over a soft area) climbing toward
 * scope (dashed gray). Hand-rolled SVG per D13: token-driven, no chart lib.
 */
export default function BurnupChart({ labels, scope, completed, height = 150, title, subtitle }: Props) {
  const steps = Math.max(labels.length, scope.length, completed.length);
  const maxY = Math.max(...scope, ...completed, 1);
  const done = completed[completed.length - 1] ?? 0;
  const total = scope[scope.length - 1] ?? 0;
  const lastX = completed.length > 1 ? ((completed.length - 1) / (steps - 1)) * W : 0;

  return (
    <div className="gt-burnup">
      {(title || subtitle) && (
        <div className="gt-burnup__head">
          <div>
            {title && <span className="gt-burnup__title">{title}</span>}
            {subtitle && <span className="gt-burnup__subtitle">{subtitle}</span>}
          </div>
          <span className="gt-burnup__stat">
            <strong>{done}</strong>/{total} pts
          </span>
        </div>
      )}

      <svg
        className="gt-burnup__plot"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={`Burnup: ${done} of ${total} points complete`}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="gt-burnup__grid" vectorEffect="non-scaling-stroke" />
        ))}
        {completed.length > 0 && (
          <polygon
            points={`0,${H} ${seriesPoints(completed, steps, maxY)} ${lastX},${H}`}
            className="gt-burnup__area"
          />
        )}
        <polyline points={seriesPoints(scope, steps, maxY)} className="gt-burnup__scope" vectorEffect="non-scaling-stroke" />
        <polyline points={seriesPoints(completed, steps, maxY)} className="gt-burnup__line" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="gt-burnup__axis">
        {labels.map((l, i) => <span key={`${i}-${l}`}>{l}</span>)}
      </div>
      <div className="gt-burnup__legend">
        <span><i className="gt-burnup__swatch gt-burnup__swatch--done" /> Completed</span>
        <span><i className="gt-burnup__swatch gt-burnup__swatch--scope" /> Scope</span>
      </div>
    </div>
  );
}
