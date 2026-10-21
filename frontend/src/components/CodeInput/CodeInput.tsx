import { Fragment, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { FieldShell } from '@/components/FieldShell/FieldShell';
import './CodeInput.scss';

export interface CodeInputProps {
  id?: string;
  /** One label for the whole group ("Class code", "Verification code"). */
  label: ReactNode;
  /** 8 for a class join code, 6 for an email verification code. @default 6 */
  length?: number;
  /** The contiguous, cleaned value (A–Z and 0–9 upper-cased, or digits), for a controlled field. */
  value?: string;
  onChange?: (value: string) => void;
  /** Called once every box is filled (submit or verify here). */
  onComplete?: (value: string) => void;
  /** Digits only, with the numeric keyboard. @default false */
  numeric?: boolean;
  /** Draws a short rule after every n boxes (4 gives "ABCD – 1234"). Decorative. */
  groupSize?: number;
  helperText?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  /** Focuses the first empty box on mount. @default false */
  autoFocus?: boolean;
  className?: string;
  /** Reaches the first box. */
  ref?: Ref<HTMLInputElement>;
}

/**
 * One-time code boxes, ported from design/components/primitives/CodeInput.jsx: 8 characters for a
 * class join code, 6 digits for an email verification code. One label names the group
 * (`role="group"`, FieldShell's `group` mode), and each box is "Character 3 of 8" or "Digit 3 of 6".
 * Typing a character fills the box and moves on; Backspace clears the box, or on an empty box steps
 * back and clears the previous one; ← → Home End move. A paste, or the phone's one-time-code autofill
 * on the first box, fills every box from there, dropping what a code cannot hold. The value has no
 * holes: a tap on a box past it lands on the first empty one, so the row is one target.
 *
 * Codebase-side: it works uncontrolled too, `ref` reaches the first box, and `autoFocus` is the first
 * empty box's own.
 */
export function CodeInput({
  id, label, length = 6, value, onChange, onComplete, numeric = false, groupSize, helperText, error, disabled = false,
  autoFocus = false, className = '', ref,
}: CodeInputProps) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  useImperativeHandle(ref, () => boxes.current[0] as HTMLInputElement, []);
  const [own, setOwn] = useState('');
  const clean = (s: string) => (numeric ? s.replace(/\D/g, '') : s.replace(/[^a-z0-9]/gi, '').toUpperCase());
  const v = clean(value ?? own).slice(0, length);
  // The value as of the last change, for a focus that moves before the next render.
  const current = useRef(v);
  useEffect(() => {
    current.current = v;
  }, [v]);

  const focusBox = (i: number) => {
    const el = boxes.current[Math.max(0, Math.min(length - 1, i))];
    if (el) {
      el.focus();
      el.select();
    }
  };
  const commit = (raw: string) => {
    const next = raw.slice(0, length);
    current.current = next;
    if (value === undefined) setOwn(next);
    onChange?.(next);
    if (next.length === length) onComplete?.(next);
  };

  const onInput = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    const typed = clean(e.target.value);
    if (!typed) return;
    const at = Math.min(i, v.length);
    commit(v.slice(0, at) + typed + v.slice(at + typed.length));
    focusBox(at + typed.length);
  };
  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (v[i]) {
        commit(v.slice(0, i) + v.slice(i + 1));
        focusBox(i);
      } else if (i > 0) {
        commit(v.slice(0, i - 1) + v.slice(i));
        focusBox(i - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusBox(Math.min(i + 1, v.length));
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusBox(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusBox(v.length);
    }
  };
  const onFocus = (i: number, e: FocusEvent<HTMLInputElement>) => {
    const filled = current.current.length;
    if (i > filled) {
      focusBox(filled);
      return;
    }
    e.target.select();
  };
  const noun = numeric ? 'Digit' : 'Character';
  const firstEmpty = Math.min(v.length, length - 1);

  return (
    <FieldShell id={id} label={label} group helperText={helperText} error={error} disabled={disabled} className={className}>
      {({ id: fieldId, labelId, describedBy, invalid }) => (
        <div className="gt-code" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
          {Array.from({ length }, (_, i) => (
            <Fragment key={i}>
              {groupSize && i > 0 && i % groupSize === 0 ? <span className="gt-code__sep" aria-hidden="true" /> : null}
              <input
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                id={i === 0 ? fieldId : undefined}
                className="gt-code__box"
                value={v[i] ?? ''}
                onChange={(e) => onInput(i, e)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onFocus={(e) => onFocus(i, e)}
                inputMode={numeric ? 'numeric' : 'text'}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus={autoFocus && i === firstEmpty}
                aria-label={`${noun} ${i + 1} of ${length}`}
                aria-invalid={invalid || undefined}
                disabled={disabled}
              />
            </Fragment>
          ))}
        </div>
      )}
    </FieldShell>
  );
}
