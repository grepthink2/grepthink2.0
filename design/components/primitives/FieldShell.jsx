import React from 'react';

const ErrorGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
);

const bucketOf = (remaining) =>
  remaining === null ? 'none' : remaining < 0 ? 'over' : remaining === 0 ? 'limit' : remaining <= 20 ? 'low' : 'ok';

/**
 * The field shell every form control shares: label (visible or visually hidden), "(optional)"
 * marker (after a real space, so the control's name reads "Description (optional)"), the control,
 * then the error (replacing the help line) and the character counter.
 * Wires `aria-describedby` / `aria-invalid` for the control through a render prop:
 * `children({ id, labelId, describedBy, invalid })`.
 * Counter: "128 / 500"; past the limit the text is kept and flagged (`--over`), never cut.
 * A polite live region speaks only when the remaining count crosses 20, 0 and the limit.
 */
export function FieldShell({
  id, label, hideLabel = false, optional = false, helperText, error, count, max,
  disabled = false, group = false, className = '', children,
}) {
  const reactId = React.useId();
  const fieldId = id || reactId;
  const labelId = `${fieldId}-label`;
  const errId = error ? `${fieldId}-err` : null;
  const helpId = !error && helperText ? `${fieldId}-help` : null;
  const hasMax = max != null;
  const countId = hasMax ? `${fieldId}-count` : null;
  const n = count || 0;
  const over = hasMax && n > max;
  const remaining = hasMax ? max - n : null;
  const bucket = bucketOf(remaining);
  const last = React.useRef(bucket);
  const [live, setLive] = React.useState('');
  React.useEffect(() => {
    if (bucket === last.current) return;
    last.current = bucket;
    setLive(bucket === 'low' ? `${remaining} characters left` : bucket === 'limit' ? 'Character limit reached'
      : bucket === 'over' ? `${-remaining} characters over the limit` : '');
  }, [bucket, remaining]);

  const ctx = { id: fieldId, labelId, describedBy: [errId, helpId, countId].filter(Boolean).join(' ') || undefined, invalid: !!error || over };
  const Label = group ? 'span' : 'label';
  return (
    <div className={['gt-field', error ? 'gt-field--error' : '', over ? 'gt-field--over' : '', disabled ? 'gt-field--disabled' : '', className].filter(Boolean).join(' ')}>
      {label && (
        <Label id={labelId} className={hideLabel ? 'gt-visually-hidden' : 'gt-field__label'} htmlFor={group ? undefined : fieldId}>
          {label}
          {optional && <> <span className="gt-field__optional">(optional)</span></>}
        </Label>
      )}
      {typeof children === 'function' ? children(ctx) : children}
      {(errId || helpId || hasMax) && (
        <div className="gt-field__footer">
          {errId && <p className="gt-field__error" id={errId}><ErrorGlyph />{error}</p>}
          {helpId && <p className="gt-field__help" id={helpId}>{helperText}</p>}
          {hasMax && (
            <span className={['gt-field__count', over ? 'gt-field__count--over' : ''].filter(Boolean).join(' ')} id={countId}>
              <span aria-hidden="true">{n} / {max}</span>
              <span className="gt-visually-hidden">{n} of {max} characters</span>
            </span>
          )}
        </div>
      )}
      {hasMax && <span className="gt-visually-hidden" aria-live="polite">{live}</span>}
    </div>
  );
}
