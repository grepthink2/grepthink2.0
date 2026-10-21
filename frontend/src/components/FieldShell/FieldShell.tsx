import { useId, useState, type ReactNode, type Ref } from 'react';
import { CircleAlert } from 'lucide-react';
import './FieldShell.scss';

/** What FieldShell hands its control through the render-prop children. */
export interface FieldShellContext {
  /** The control's id: the label's `htmlFor` target. */
  id: string;
  /** The label's id, for a control group named with `aria-labelledby` (`group`). */
  labelId: string;
  /** The ids of the error or help line and of the counter, for `aria-describedby`; undefined when there are none. */
  describedBy?: string;
  /** True while `error` is set or the count is past `max`: the control's `aria-invalid`. */
  invalid: boolean;
}

export interface FieldShellProps {
  /** The control's id. Generated when omitted, so two copies of one form never share ids. */
  id?: string;
  label?: ReactNode;
  /** Keeps the label for screen readers only (search boxes, inline editors). A placeholder is never the label. @default false */
  hideLabel?: boolean;
  /** A quiet "(optional)" after the label. Required fields carry no visible mark. @default false */
  optional?: boolean;
  helperText?: ReactNode;
  /** Replaces the help line and marks the control invalid. */
  error?: ReactNode;
  /** The current length, for the counter. */
  count?: number;
  /** A soft limit: shows "count / max"; past it the field is flagged, never truncated. */
  max?: number;
  /**
   * Shows the "count / max" counter. Hidden, the limit still flags the field past it and keeps its
   * live region, which must be in place before it first speaks (Input shows its counter from 80%).
   * @default true
   */
  showCount?: boolean;
  disabled?: boolean;
  /** Renders the label as a <span> for a control group named with `aria-labelledby` (CodeInput). @default false */
  group?: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode | ((ctx: FieldShellContext) => ReactNode);
}

type Bucket = 'none' | 'ok' | 'low' | 'limit' | 'over';

const bucketOf = (remaining: number | null): Bucket =>
  remaining === null ? 'none' : remaining < 0 ? 'over' : remaining === 0 ? 'limit' : remaining <= 20 ? 'low' : 'ok';

const characters = (n: number) => `${n} ${n === 1 ? 'character' : 'characters'}`;

/** What the live region says on entering a bucket: nothing for 'ok' and 'none'. */
function announcement(bucket: Bucket, remaining: number): string {
  if (bucket === 'low') return `${characters(remaining)} left`;
  if (bucket === 'limit') return 'Character limit reached';
  if (bucket === 'over') return `${characters(-remaining)} over the limit`;
  return '';
}

/**
 * The field shell every form control shares, ported from design/components/primitives/FieldShell.jsx:
 * the label (or a visually hidden one), a quiet "(optional)", the control, then the error (which
 * replaces the help line) and the counter. The control gets its id, `aria-describedby` and
 * `aria-invalid` through the render-prop children. Errors are not live regions: a form moves focus to
 * its first invalid field on submit, and a save error is an Alert above the actions.
 *
 * Counter: "128 / 500" on screen, "128 of 500 characters" to a screen reader. Past the limit the text
 * is kept and the field flagged (`gt-field--over`, invalid), never cut: the form's validation blocks
 * the save. A polite live region speaks only when the remaining count crosses 20, at the limit and
 * when over, not on every keystroke.
 *
 * Codebase-side: a space before "(optional)", so the control's name reads "Pronouns (optional)"; the
 * design's 4px margin alone gives the name "Pronouns(optional)". `showCount={false}` keeps a limit with
 * its counter hidden, so the live region is in place before the counter appears. `ref` reaches the
 * root.
 */
export function FieldShell({
  id, label, hideLabel = false, optional = false, helperText, error, count, max, showCount = true, disabled = false,
  group = false, className = '', ref, children,
}: FieldShellProps) {
  const reactId = useId();
  const fieldId = id || reactId;
  const labelId = `${fieldId}-label`;
  const errId = error ? `${fieldId}-err` : undefined;
  const helpId = !error && helperText ? `${fieldId}-help` : undefined;
  const hasMax = max != null;
  const counted = hasMax && showCount;
  const countId = counted ? `${fieldId}-count` : undefined;
  const n = count ?? 0;
  const over = hasMax && n > max;
  const remaining = hasMax ? max - n : null;
  const bucket = bucketOf(remaining);

  // The live region's text changes only when the count moves into another bucket.
  const [spoken, setSpoken] = useState({ bucket, text: '' });
  if (spoken.bucket !== bucket) setSpoken({ bucket, text: announcement(bucket, remaining ?? 0) });

  const ctx: FieldShellContext = {
    id: fieldId,
    labelId,
    describedBy: [errId, helpId, countId].filter(Boolean).join(' ') || undefined,
    invalid: !!error || over,
  };
  const labelClass = hideLabel ? 'gt-visually-hidden' : 'gt-field__label';
  const labelText = (
    <>
      {label}
      {optional ? <>{' '}<span className="gt-field__optional">(optional)</span></> : null}
    </>
  );

  return (
    <div
      ref={ref}
      className={['gt-field', error ? 'gt-field--error' : '', over ? 'gt-field--over' : '', disabled ? 'gt-field--disabled' : '', className]
        .filter(Boolean).join(' ')}
    >
      {label ? (
        group
          ? <span id={labelId} className={labelClass}>{labelText}</span>
          : <label id={labelId} className={labelClass} htmlFor={fieldId}>{labelText}</label>
      ) : null}
      {typeof children === 'function' ? children(ctx) : children}
      {(errId || helpId || counted) && (
        <div className="gt-field__footer">
          {errId && (
            <p className="gt-field__error" id={errId}>
              <CircleAlert size={13} strokeWidth={2.2} aria-hidden="true" />
              {error}
            </p>
          )}
          {helpId && <p className="gt-field__help" id={helpId}>{helperText}</p>}
          {counted && (
            <span className={['gt-field__count', over ? 'gt-field__count--over' : ''].filter(Boolean).join(' ')} id={countId}>
              <span aria-hidden="true">{n} / {max}</span>
              <span className="gt-visually-hidden">{n} of {max} characters</span>
            </span>
          )}
        </div>
      )}
      {hasMax && <span className="gt-visually-hidden" aria-live="polite">{spoken.text}</span>}
    </div>
  );
}
