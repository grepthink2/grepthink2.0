import { useId, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { InfoPopover } from '@/components/InfoPopover/InfoPopover';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { deltaPoints, signedPercent } from '@/lib/deltaFormat';
import { compactNumber } from '@/lib/numberFormat';
import './StatCard.scss';

export interface StatCardDelta {
  /** The change as a ratio (0.18 is "+18%"); null, with no baseline, hides the delta. */
  value: number | null;
  /** What it compares with ("vs the 7 days before"). */
  vsLabel?: string;
  /** Whether a rise is good (green). @default true */
  goodWhenUp?: boolean;
}

export interface StatCardInfo {
  /** @default the card's label */
  title?: string;
  body: ReactNode;
  learnMoreHref?: string;
}

export interface StatCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick' | 'children'> {
  label: string;
  /** A number or a preformatted string; null or undefined renders "—". */
  value: number | string | null | undefined;
  /** The muted line under the value: why a value is "—", what it counts. */
  hint?: ReactNode;
  /** A 16px icon in the tinted 30px chip. */
  icon?: ReactNode;
  /** @default 'primary' */
  accent?: 'primary' | 'blue' | 'purple' | 'amber';
  /** 'raw' as given · 'compact' 12.9K / 1.3M · 'percent' 0.82 is 82%. @default 'raw' */
  format?: 'raw' | 'compact' | 'percent';
  delta?: StatCardDelta;
  /** 2–12 weekly points (complete weeks only); fewer than 2 draw nothing. */
  trend?: number[];
  /** An ⓘ InfoPopover beside the label: the explanation a keyboard can reach. */
  info?: StatCardInfo;
  /** The source failed: "—" and "Could not load". @default false */
  failed?: boolean;
  /** A skeleton for the value, and `aria-busy`. @default false */
  loading?: boolean;
  /** The analytics tile density (14px padding, an h2 value). @default false */
  compact?: boolean;
  /** Makes the card a stretched button named "{label}: {value}". */
  onClick?: () => void;
  /** Set from `loading`. JSX takes any hyphenated prop a type leaves out, so it is declared `never`. */
  'aria-busy'?: never;
  ref?: Ref<HTMLDivElement>;
}

const shows = (node: ReactNode) => node !== undefined && node !== null && node !== false && node !== '';

function formatValue(value: number | string, format: StatCardProps['format']): number | string {
  if (typeof value !== 'number') return value;
  if (format === 'percent') return `${Math.round(value * 100)}%`;
  if (format === 'compact') return compactNumber(value);
  return value;
}

/** The sparkline's box (84 × 24) and how far its line keeps from the edges. */
const W = 84;
const H = 24;
const PAD = 3;

/** Weekly history in the de-emphasis grey, its last point the green dot with a white ring. Decorative: the value and delta carry the figures. */
function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
  const last = points.length - 1;
  return (
    <svg className="gt-stat-card__spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <path className="gt-stat-card__spark-line" d={points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
      <circle className="gt-stat-card__spark-dot" cx={x(last)} cy={y(points[last])} r="3.5" />
    </svg>
  );
}

/**
 * The metric card, ported from design/components/display/StatCard.jsx: one component for the
 * Dashboard's cards and the analytics tiles (`compact`, with `format="compact"`). An uppercase label,
 * with an InfoPopover ⓘ beside it when `info` is given; the big value; a 30px icon chip tinted by
 * `accent`; and a bottom row with the hint, the `delta` and a 2–12 point `trend` sparkline. `failed`,
 * or a null value, shows "—" ("Could not load" under a failed one); `loading` shows a skeleton and
 * marks the card `aria-busy`. With `onClick` the card is a stretched button under its content, named
 * "{label}: {value}", and the ⓘ stays its own control above it.
 *
 * Codebase-side, from the metric card and StatTile it replaces: the delta reads with a true minus
 * ("−20%") and is coloured by the figure shown, so "0%" is flat whatever the ratio behind it; the
 * sparkline is decorative, as the value and delta carry its figures; the stretched button is described
 * by the delta and hint, names only the label while loading (the figure is not known yet), and calls
 * `onClick` with no arguments; and a NaN value reads "—" too.
 *
 * Native props and `ref` reach the card's root.
 */
export function StatCard({
  label, value, hint, icon, accent = 'primary', format = 'raw', delta, trend, info, failed = false, loading = false,
  compact = false, onClick, className = '', ref, ...rest
}: StatCardProps) {
  const metaId = useId();
  const isNull = failed || value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value));
  const shown = isNull ? '—' : formatValue(value, format);
  const shownHint = failed && !shows(hint) ? 'Could not load' : hint;

  // Whole percentage points, the rounding behind both the figure and its tone; null without a baseline.
  const points = delta && !failed && !loading ? deltaPoints(delta.value ?? null) : null;
  let deltaNode: ReactNode = null;
  if (delta && points !== null) {
    const dir = points === 0 ? 'flat' : points > 0 ? 'up' : 'down';
    const tone = dir === 'flat' ? 'flat' : (dir === 'up') === (delta.goodWhenUp !== false) ? 'good' : 'bad';
    const Icon = dir === 'flat' ? Minus : dir === 'up' ? TrendingUp : TrendingDown;
    deltaNode = (
      <span className={`gt-stat-card__delta gt-stat-card__delta--${tone}`}>
        <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
        <span className="gt-stat-card__delta-value">{signedPercent(delta.value)}</span>
        {delta.vsLabel && <> <span className="gt-stat-card__delta-vs">{delta.vsLabel}</span></>}
      </span>
    );
  }
  const hasMeta = deltaNode !== null || shows(shownHint);
  const sparkPoints = !failed && !loading && Array.isArray(trend) && trend.length > 1 ? trend : null;

  return (
    <div
      {...rest}
      ref={ref}
      className={[
        'gt-stat-card', `gt-stat-card--${accent}`, compact ? 'gt-stat-card--compact' : '', onClick ? 'gt-stat-card--clickable' : '', className,
      ].filter(Boolean).join(' ')}
      aria-busy={loading || undefined}
    >
      {onClick && (
        <button
          type="button"
          className="gt-stat-card__hit"
          onClick={() => onClick()}
          aria-label={loading ? label : `${label}: ${shown}`}
          aria-describedby={hasMeta ? metaId : undefined}
        />
      )}
      <div className="gt-stat-card__top">
        <span className="gt-stat-card__label-row">
          <span className="gt-stat-card__label">{label}</span>
          {info && (
            <InfoPopover title={info.title || label} body={info.body} learnMoreHref={info.learnMoreHref} label={`About ${label.toLowerCase()}`} />
          )}
        </span>
        {shows(icon) && <span className="gt-stat-card__icon" aria-hidden="true">{icon}</span>}
      </div>
      <span className={['gt-stat-card__value', isNull && !loading ? 'gt-stat-card__null' : ''].filter(Boolean).join(' ')}>
        {loading ? <Skeleton width={64} height={22} /> : shown}
      </span>
      {(hasMeta || sparkPoints) && (
        <div className="gt-stat-card__bottom">
          <span className="gt-stat-card__meta" id={metaId}>
            {deltaNode}
            {deltaNode !== null && shows(shownHint) && ' '}
            {shows(shownHint) && <span className="gt-stat-card__hint">{shownHint}</span>}
          </span>
          {sparkPoints && <Sparkline points={sparkPoints} />}
        </div>
      )}
    </div>
  );
}
