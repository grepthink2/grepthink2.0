import React from 'react';
import { FieldShell } from './FieldShell.jsx';

/** A box's caret or selection. */
const selectionOf = (el) => ({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });

/**
 * One-time code boxes: 8 characters for a class join code, 6 digits for email verification.
 * One label for the group (`role="group"`); typing advances, Backspace steps back, pasting
 * (or the phone's one-time-code autofill) fills every box. The value is contiguous: a tap on any
 * box lands on the first empty one, so the whole row is one target.
 * Kept in step with the codebase (fold-back 2026-10-22): each keystroke reads the input's current
 * value (a ref, for a focus that moves before the next render); typing over a collapsed caret
 * replaces the box's character (WebKit collapses the selection a box makes on focus); and
 * `onComplete` fires once per new full code, never for an edit that leaves the code as it was.
 */
export function CodeInput({
  id, label, length = 6, value, onChange, onComplete, numeric = false, groupSize,
  helperText, error, disabled = false, autoFocus = false, className = '',
}) {
  const refs = React.useRef([]);
  const [own, setOwn] = React.useState('');
  const clean = (s) => (numeric ? s.replace(/\D/g, '') : s.replace(/[^a-z0-9]/gi, '').toUpperCase());
  const v = clean(value ?? own).slice(0, length);
  const current = React.useRef(v);
  React.useEffect(() => { current.current = v; }, [v]);
  // Each box's caret or selection as a key or paste in it began: it tells an input that kept the
  // box's character from one that replaced it.
  const selections = React.useRef([]);
  const track = (i, el) => { selections.current[i] = selectionOf(el); };
  React.useEffect(() => {
    const onSelectionChange = () => {
      const i = refs.current.findIndex((box) => box && box === document.activeElement);
      const box = refs.current[i];
      if (box) selections.current[i] = selectionOf(box);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const focusBox = (i) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) { el.focus(); el.select(); }
  };
  const commit = (raw) => {
    const next = raw.slice(0, length);
    const before = current.current;
    current.current = next;
    if (value === undefined) setOwn(next);
    if (onChange) onChange(next);
    if (next.length === length && next !== before && onComplete) onComplete(next);
  };
  React.useEffect(() => { if (autoFocus) focusBox(v.length); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onInput = (i, e) => {
    let raw = e.target.value;
    const char = v[i];
    const sel = selections.current[i];
    // A box selects its character on focus, so what comes in replaces it. When that selection
    // collapsed (WebKit, after the click that focused the box), the character stayed in the value,
    // before or after what came in: drop it, from the side the caret was not on.
    if (char && sel && sel.start === sel.end && raw.length > char.length) {
      if (sel.start === 0 && raw.endsWith(char)) raw = raw.slice(0, -char.length);
      else if (sel.start > 0 && raw.startsWith(char)) raw = raw.slice(char.length);
    }
    const typed = clean(raw);
    if (!typed) return;
    const at = Math.min(i, v.length);
    commit(v.slice(0, at) + typed + v.slice(at + typed.length));
    focusBox(at + typed.length);
  };
  const onKeyDown = (i, e) => {
    track(i, e.currentTarget);
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
    const filled = current.current.length;
    if (i > filled) { focusBox(filled); return; }
    e.target.select();
    track(i, e.target);
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
                onPaste={(e) => track(i, e.currentTarget)}
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
