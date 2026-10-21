import { useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { FieldShell } from '@/components/FieldShell/FieldShell';
// The exact-value input wears Input's classes, so its styles come with every Slider.
import '@/components/Input/Input.scss';
import './Slider.scss';

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'color' | 'aria-invalid' | 'aria-valuetext'
> {
  /** The range input's id. Generated when omitted. */
  id?: string;
  /** Visible label (screen-reader-only with `hideLabel`): the slider's name. */
  label: ReactNode;
  /** @default false */
  hideLabel?: boolean;
  /** The value, for a controlled slider; `defaultValue` for an uncontrolled one. */
  value?: number;
  /** Uncontrolled start value. @default min */
  defaultValue?: number;
  /** Receives the new number (snapped to `step`, clamped to min…max), only when it changes. */
  onChange?: (value: number) => void;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** @default 1 */
  step?: number;
  /** PageUp / PageDown jump. @default a tenth of the range (at least `step`) */
  pageStep?: number;
  /** Shown after the value and in `aria-valuetext` ("%", " pts"). */
  unit?: string;
  /** Replaces `${value}${unit}` beside the slider and in `aria-valuetext`. */
  formatValue?: (value: number) => string;
  /** Screen-reader text only ("25 percent of the work"). @default the shown value */
  valueText?: (value: number) => string;
  /** A paired number input (64px, compact) kept in sync, instead of the read-only value. @default false */
  withInput?: boolean;
  /** Fill and thumb colour: a token reference (`var(--gt-avatar-2)`) to match a legend swatch. @default var(--gt-primary) */
  color?: string;
  helperText?: ReactNode;
  /** Error line; turns fill and thumb red and sets `aria-invalid`. */
  error?: ReactNode;
  /** @default false */
  optional?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Set from `error`, and `aria-valuetext` from `valueText` or the shown value. JSX takes any hyphenated
   * prop a type leaves out, so both are declared `never`.
   */
  'aria-invalid'?: never;
  'aria-valuetext'?: never;
  /** Reaches the range input. */
  ref?: Ref<HTMLInputElement>;
}

/** Drops the noise of binary fractions (0.2 + 0.1 is 0.30000000000000004), to the design's six decimals. */
const tidy = (n: number) => +n.toFixed(6);

/**
 * Labelled range, ported from design/components/primitives/Slider.jsx: the WAI-ARIA Slider pattern on
 * a native `<input type="range">` in the field shell (label, "(optional)", help or error), so the
 * role, the value and the arrow, Home and End keys are the browser's. The value shows beside the track
 * ("25%", or `formatValue`), hidden from screen readers, which hear it as `aria-valuetext` (`valueText`,
 * by default the shown text). `withInput` swaps the value for a 64px compact number input named
 * "{label} exact value", kept in sync: a value typed in range moves the slider at once; on blur an
 * out-of-range one is clamped and an empty one put back. PageUp / PageDown move `pageStep` (a tenth of
 * the range, at least a step) here rather than by each browser's own amount. Every value is snapped to
 * `step`, clamped to min…max and free of floating-point noise, and `onChange` hears a number only when
 * it changes. `color` (a token reference) tints the fill and the thumb, and an error turns both
 * `--gt-error`. On phones the control is 44px tall, and so is the number input.
 *
 * Native props and `ref` reach the range input, before its own attributes; `className` goes on the
 * field. Codebase-side: a caller's `aria-describedby` comes ahead of the help or error, on the number
 * input too; a caller's `onKeyDown` runs first, and PageUp / PageDown do nothing when it prevents the
 * default. When the range is not a whole number of steps, the top is the last step inside max, where the
 * browser's range stops (0…10 in 3s stops at 9). The shown value is snapped and clamped too, so a value
 * passed off a step shows where the thumb sits, and one that is not a number shows min. The range's own
 * box drops index.css's focus ring, so the ring is the thumb's alone, as the design draws it.
 */
export function Slider({
  id, label, hideLabel = false, value, defaultValue, onChange, min = 0, max = 100, step = 1, pageStep, unit = '',
  formatValue, valueText, withInput = false, color, helperText, error, optional = false, disabled = false,
  className = '', onKeyDown, 'aria-describedby': describedByProp, ref, ...rest
}: SliderProps) {
  const [own, setOwn] = useState(() => defaultValue ?? min);
  // What is typed in the number input, while it differs from the value; null otherwise.
  const [draft, setDraft] = useState<string | null>(null);

  // A number snapped to the steps that run from min, and clamped to min…top: the last step inside max.
  const top = tidy(min + Math.floor(tidy(Math.max(0, max - min) / step)) * step);
  const settle = (n: number) => Math.min(top, tidy(min + Math.round((Math.max(min, n) - min) / step) * step));
  const raw = value ?? own;
  const v = Number.isFinite(raw) ? settle(raw) : min;

  const commit = (n: number) => {
    const next = settle(n);
    if (value === undefined) setOwn(next);
    if (next !== v) onChange?.(next);
  };
  const page = pageStep ?? Math.max(step, (max - min) / 10);
  const onRangeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || (e.key !== 'PageUp' && e.key !== 'PageDown')) return;
    e.preventDefault();
    commit(v + (e.key === 'PageUp' ? page : -page));
  };

  const shown = formatValue ? formatValue(v) : `${v}${unit}`;
  const style = {
    '--gt-slider-frac': max > min ? (v - min) / (max - min) : 0,
    ...(color ? { '--gt-slider-accent': color } : {}),
  } as CSSProperties;

  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      optional={optional}
      helperText={helperText}
      error={error}
      disabled={disabled}
      className={['gt-slider', disabled ? 'gt-slider--disabled' : '', className].filter(Boolean).join(' ')}
    >
      {({ id: rangeId, labelId, describedBy, invalid }) => {
        const description = [describedByProp, describedBy].filter(Boolean).join(' ') || undefined;
        const exactId = `${rangeId}-exact`;
        return (
          <div className="gt-slider__row">
            <div className="gt-slider__control" style={style}>
              <span className="gt-slider__track" aria-hidden="true"><span className="gt-slider__fill" /></span>
              <input
                {...rest}
                ref={ref}
                id={rangeId}
                type="range"
                className="gt-slider__input"
                min={min}
                max={max}
                step={step}
                value={v}
                onChange={(e) => commit(Number(e.target.value))}
                onKeyDown={onRangeKeyDown}
                disabled={disabled}
                aria-valuetext={valueText ? valueText(v) : shown}
                aria-invalid={invalid || undefined}
                aria-describedby={description}
              />
            </div>
            {withInput ? (
              <span className="gt-slider__number">
                <span className="gt-visually-hidden" id={exactId}>exact value</span>
                <input
                  type="number"
                  className="gt-input gt-input--compact gt-slider__number-input"
                  inputMode="decimal"
                  min={min}
                  max={max}
                  step={step}
                  value={draft ?? String(v)}
                  onChange={(e) => {
                    const text = e.target.value;
                    setDraft(text);
                    const n = Number(text);
                    if (text !== '' && n >= min && n <= max) commit(n);
                  }}
                  onBlur={() => {
                    // Past min or max: clamped. Left empty: the value is put back.
                    if (draft) commit(Number(draft));
                    setDraft(null);
                  }}
                  disabled={disabled}
                  aria-labelledby={`${labelId} ${exactId}`}
                  aria-describedby={description}
                  aria-invalid={invalid || undefined}
                />
                {unit && <span className="gt-slider__unit" aria-hidden="true">{unit}</span>}
              </span>
            ) : (
              <output className="gt-slider__value" htmlFor={rangeId} aria-hidden="true">{shown}</output>
            )}
          </div>
        );
      }}
    </FieldShell>
  );
}
