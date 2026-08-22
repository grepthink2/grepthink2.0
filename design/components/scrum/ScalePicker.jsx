import React from 'react';

/** The three estimate scales for story/task points. */
export const ESTIMATE_SCALES = {
  linear: [1, 2, 3, 4, 5, 6],
  exponential: [1, 2, 4, 8, 16, 32],
  fibonacci: [1, 2, 3, 5, 8, 13],
};

/**
 * Estimate-scale picker — segmented choice of linear / exponential /
 * fibonacci; the project-level setting that drives PointPicker values.
 */
export function ScalePicker({ value = 'fibonacci', onChange, className = '' }) {
  return (
    <div className={['gt-scalepicker', className].filter(Boolean).join(' ')} role="radiogroup" aria-label="Estimate scale">
      {Object.keys(ESTIMATE_SCALES).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          className={['gt-scalepicker__opt', value === k ? 'gt-scalepicker__opt--active' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange && onChange(k)}
        >
          <span className="gt-scalepicker__name">{k}</span>
          <span className="gt-scalepicker__preview">{ESTIMATE_SCALES[k].join(' · ')}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Point picker — chip row of the active scale's values for estimating
 * a story or task.
 */
export function PointPicker({ scale = 'fibonacci', value, onChange, className = '' }) {
  const values = ESTIMATE_SCALES[scale] || ESTIMATE_SCALES.fibonacci;
  return (
    <div className={['gt-pointpicker', className].filter(Boolean).join(' ')} role="radiogroup" aria-label="Points">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={['gt-pointpicker__chip', value === v ? 'gt-pointpicker__chip--active' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange && onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
