import type { HTMLAttributes, Ref } from 'react';
import './ProgressBar.scss';

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  value: number;
  /** @default 100 */
  max?: number;
  /** @default 'primary' */
  tone?: 'primary' | 'blue' | 'warning' | 'error';
  /** The track's height: 4 / 8 / 12 (an `inline` bar is always 4). @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Shows the % readout. @default false */
  showLabel?: boolean;
  /** The visible label, and the bar's accessible name. */
  label?: string;
  /** `aria-valuetext`, when "68%" is not the meaningful reading ("5 of 8 tasks"). */
  valueText?: string;
  /** The 4px bar with no head, for table cells, story cards and the sprint picker. @default false */
  inline?: boolean;
  /** Hidden from assistive tech: the number is printed beside it. @default false */
  decorative?: boolean;
  /** `role="meter"`, for a measurement (a contribution share) rather than progress toward done. @default false */
  meter?: boolean;
  /**
   * Set on the bar itself from `meter`, `decorative`, `value`, `max`, `valueText` and `label`. JSX takes
   * any hyphenated prop a type leaves out, so these are declared `never` rather than only omitted.
   */
  role?: never;
  'aria-valuenow'?: never;
  'aria-valuemin'?: never;
  'aria-valuemax'?: never;
  'aria-valuetext'?: never;
  'aria-label'?: never;
  'aria-hidden'?: never;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Progress toward done, or a measurement, ported from design/components/display/ProgressBar.jsx. A
 * label and % head (hidden from assistive tech: the bar carries the name and value) over a 4, 8 or
 * 12px track, filled green, blue, amber or red; `inline` is the 4px bar with no head. The track is a
 * `progressbar`, or a `meter` with `meter`, named by `label` ("Progress" without one), with
 * `aria-valuenow` against `max` and `valueText` as its reading; `decorative` hides it, for a bar with
 * its number printed beside it. The fill's width is clamped to 0–100%.
 *
 * Codebase-side: the value the bar reports is clamped between 0 and `max` as well, as ARIA asks. Native
 * props and `ref` reach the root.
 */
export function ProgressBar({
  value, max = 100, tone = 'primary', size = 'md', showLabel = false, label, valueText, inline = false,
  decorative = false, meter = false, className = '', ref, ...rest
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const track = (
    <div
      className="gt-progress__track"
      role={decorative ? undefined : meter ? 'meter' : 'progressbar'}
      aria-valuenow={decorative ? undefined : Math.min(Math.max(Math.round(value), 0), max)}
      aria-valuemin={decorative ? undefined : 0}
      aria-valuemax={decorative ? undefined : max}
      aria-valuetext={decorative ? undefined : valueText}
      aria-label={decorative ? undefined : label || 'Progress'}
      aria-hidden={decorative || undefined}
    >
      <div className={`gt-progress__fill gt-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
  if (inline) {
    return (
      <div {...rest} ref={ref} className={['gt-progress', 'gt-progress--inline', className].filter(Boolean).join(' ')}>
        {track}
      </div>
    );
  }
  return (
    <div {...rest} ref={ref} className={['gt-progress', `gt-progress--${size}`, className].filter(Boolean).join(' ')}>
      {(label || showLabel) && (
        <div className="gt-progress__head" aria-hidden="true">
          {label && <span className="gt-progress__label">{label}</span>}
          {showLabel && <span className="gt-progress__pct">{Math.round(pct)}%</span>}
        </div>
      )}
      {track}
    </div>
  );
}
