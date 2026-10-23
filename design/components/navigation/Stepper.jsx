import React from 'react';

const Check = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
const Alert = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01" /></svg>;
const STATE_TEXT = { done: 'completed', error: 'has errors', current: 'current step', upcoming: 'not started' };

/**
 * Stepper — the TSR form's steps as an ordered list inside a <nav>. Each step is done, current,
 * upcoming or error; done steps show a check and error steps an alert mark (plus visually hidden
 * text), so state is never colour alone. Done and error steps are buttons back to that step when
 * `onStepClick` is set; upcoming steps are not interactive. Under 768px it collapses to
 * "Step 2 of 4 · Rate teammates" with an inline meter.
 */
export function Stepper({ steps = [], current = 0, onStepClick, ariaLabel = 'Progress', className = '' }) {
  const stateOf = (s, i) => s.state || (i < current ? 'done' : i === current ? 'current' : 'upcoming');
  const cur = steps[current];
  const pct = steps.length ? Math.round(((current + 1) / steps.length) * 100) : 0;
  return (
    <nav className={['gt-stepper', className].filter(Boolean).join(' ')} aria-label={ariaLabel}>
      <ol className="gt-stepper__list">
        {steps.map((s, i) => {
          const st = stateOf(s, i);
          const clickable = onStepClick && (st === 'done' || st === 'error');
          const inner = (
            <>
              <span className="gt-stepper__marker" aria-hidden="true">{st === 'done' ? <Check /> : st === 'error' ? <Alert /> : i + 1}</span>
              <span className="gt-stepper__label">
                <span className="gt-visually-hidden">Step {i + 1}: </span>{s.label}
                <span className="gt-visually-hidden">, {STATE_TEXT[st]}</span>
              </span>
            </>
          );
          return (
            <li key={s.id ?? i} className={`gt-stepper__step gt-stepper__step--${st}`} aria-current={st === 'current' ? 'step' : undefined}>
              {clickable
                ? <button type="button" className="gt-stepper__hit" onClick={() => onStepClick(s.id ?? i, i)}>{inner}</button>
                : <span className="gt-stepper__static">{inner}</span>}
            </li>
          );
        })}
      </ol>
      <div className="gt-stepper__compact">
        <p className="gt-stepper__compact-text">Step <b>{current + 1}</b> of {steps.length}{cur ? <> · <b>{cur.label}</b></> : null}</p>
        <div className="gt-progress gt-progress--inline" aria-hidden="true"><div className="gt-progress__track"><div className="gt-progress__fill gt-progress__fill--primary" style={{ width: `${pct}%` }} /></div></div>
      </div>
    </nav>
  );
}
