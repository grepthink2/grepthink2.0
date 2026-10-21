import React from 'react';
import { FieldShell } from './FieldShell.jsx';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const snap = (v, min, step) => +(min + Math.round((v - min) / step) * step).toFixed(6);

/**
 * Labelled range — WAI-ARIA Slider pattern on a native <input type="range"> in the field shell
 * (label, help / error, "(optional)"). The value shows beside it with an optional unit ("25%"),
 * or, with `withInput`, a paired number input kept in sync (typing commits in-range values at
 * once and clamps on blur). Keys: ← ↓ / → ↑ one step, PageDown / PageUp `pageStep` (a tenth of
 * the range by default), Home / End the ends. `color` tints fill and thumb (a token reference, to
 * match a legend swatch); an error turns both red. 44px tall on phones. Replaces the TSR
 * contributions step's feature-styled range.
 */
export function Slider({
  id, label, hideLabel = false, value, defaultValue, onChange, min = 0, max = 100, step = 1, pageStep,
  unit = '', formatValue, valueText, withInput = false, color, helperText, error, optional = false,
  disabled = false, className = '', ...rest
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(defaultValue ?? min);
  const [draft, setDraft] = React.useState(null);
  const v = clamp(Number(controlled ? value : inner), min, max);
  const commit = (n) => {
    const next = clamp(snap(n, min, step), min, max);
    if (!controlled) setInner(next);
    if (onChange && next !== v) onChange(next);
  };
  const big = pageStep ?? Math.max(step, (max - min) / 10);
  const frac = max > min ? (v - min) / (max - min) : 0;
  const shown = formatValue ? formatValue(v) : `${v}${unit}`;
  const onKeyDown = (e) => {
    if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
    e.preventDefault();
    commit(v + (e.key === 'PageUp' ? big : -big));
  };
  const style = { '--gt-slider-frac': frac };
  if (color) style['--gt-slider-accent'] = color;

  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} optional={optional} helperText={helperText} error={error} disabled={disabled}
      className={['gt-slider', disabled ? 'gt-slider--disabled' : '', className].filter(Boolean).join(' ')}>
      {({ id: sid, labelId, describedBy, invalid }) => (
        <div className="gt-slider__row">
          <div className="gt-slider__control" style={style}>
            <span className="gt-slider__track" aria-hidden="true"><span className="gt-slider__fill" /></span>
            <input
              id={sid}
              type="range"
              className="gt-slider__input"
              min={min}
              max={max}
              step={step}
              value={v}
              onChange={(e) => commit(Number(e.target.value))}
              onKeyDown={onKeyDown}
              disabled={disabled}
              aria-valuetext={valueText ? valueText(v) : shown}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              {...rest}
            />
          </div>
          {withInput ? (
            <span className="gt-slider__number">
              <span className="gt-visually-hidden" id={`${sid}-exact`}>exact value</span>
              <input
                type="number"
                className="gt-input gt-input--compact gt-slider__number-input"
                inputMode="decimal"
                min={min}
                max={max}
                step={step}
                value={draft ?? String(v)}
                onChange={(e) => {
                  const t = e.target.value;
                  setDraft(t);
                  const n = Number(t);
                  if (t !== '' && Number.isFinite(n) && n >= min && n <= max) commit(n);
                }}
                onBlur={() => {
                  if (draft === null) return;
                  const n = Number(draft);
                  commit(draft === '' || !Number.isFinite(n) ? v : n);
                  setDraft(null);
                }}
                disabled={disabled}
                aria-labelledby={`${labelId} ${sid}-exact`}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
              {unit && <span className="gt-slider__unit" aria-hidden="true">{unit}</span>}
            </span>
          ) : (
            <output className="gt-slider__value" htmlFor={sid} aria-hidden="true">{shown}</output>
          )}
        </div>
      )}
    </FieldShell>
  );
}
