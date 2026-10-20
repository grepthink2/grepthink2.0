import React from 'react';
import { FieldShell } from './FieldShell.jsx';

/**
 * One-time code boxes: 8 characters for a class join code, 6 digits for email verification.
 * One label for the group (`role="group"`); typing advances, Backspace steps back, pasting
 * (or the phone's one-time-code autofill) fills every box. The value is contiguous: a tap on any
 * box lands on the first empty one, so the whole row is one target.
 */
export function CodeInput({
  id, label, length = 6, value = '', onChange, onComplete, numeric = false, groupSize,
  helperText, error, disabled = false, autoFocus = false, className = '',
}) {
  const refs = React.useRef([]);
  const clean = (s) => (numeric ? s.replace(/\D/g, '') : s.replace(/[^a-z0-9]/gi, '').toUpperCase());
  const v = clean(value).slice(0, length);
  const focusBox = (i) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) { el.focus(); el.select(); }
  };
  const commit = (next) => {
    next = next.slice(0, length);
    if (onChange) onChange(next);
    if (next.length === length && onComplete) onComplete(next);
  };
  React.useEffect(() => { if (autoFocus) focusBox(v.length); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onInput = (i, e) => {
    const typed = clean(e.target.value);
    if (!typed) return;
    const at = Math.min(i, v.length);
    commit(v.slice(0, at) + typed + v.slice(at + typed.length));
    focusBox(at + typed.length);
  };
  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (v[i]) { commit(v.slice(0, i) + v.slice(i + 1)); focusBox(i); }
      else if (i > 0) { commit(v.slice(0, i - 1) + v.slice(i)); focusBox(i - 1); }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focusBox(i - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusBox(Math.min(i + 1, v.length)); }
    else if (e.key === 'Home') { e.preventDefault(); focusBox(0); }
    else if (e.key === 'End') { e.preventDefault(); focusBox(v.length); }
  };
  const onFocus = (i, e) => {
    if (i > v.length) { focusBox(v.length); return; }
    e.target.select();
  };
  const noun = numeric ? 'Digit' : 'Character';

  return (
    <FieldShell id={id} label={label} group helperText={helperText} error={error} disabled={disabled} className={className}>
      {({ id: fid, labelId, describedBy, invalid }) => (
        <div className="gt-code" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
          {Array.from({ length }, (_, i) => (
            <React.Fragment key={i}>
              {groupSize && i > 0 && i % groupSize === 0 && <span className="gt-code__sep" aria-hidden="true" />}
              <input
                ref={(el) => { refs.current[i] = el; }}
                id={i === 0 ? fid : undefined}
                className="gt-code__box"
                value={v[i] || ''}
                onChange={(e) => onInput(i, e)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onFocus={(e) => onFocus(i, e)}
                inputMode={numeric ? 'numeric' : 'text'}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                autoCapitalize="characters"
                spellCheck={false}
                aria-label={`${noun} ${i + 1} of ${length}`}
                aria-invalid={invalid || undefined}
                disabled={disabled}
              />
            </React.Fragment>
          ))}
        </div>
      )}
    </FieldShell>
  );
}
