import { ESTIMATE_SCALES } from '../config/scrumTags';
import type { EstimateScale } from '../config/scrumTags';

/** Project-level estimate-scale setting (D3). Changing it only changes the
 *  values PointPicker offers — existing point values are untouched. */
export function ScalePicker({ value, onChange }: { value: EstimateScale; onChange?: (s: EstimateScale) => void }) {
  return (
    <div className="gt-scalepicker" role="radiogroup" aria-label="Estimate scale">
      {(Object.keys(ESTIMATE_SCALES) as EstimateScale[]).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          className={`gt-scalepicker__opt${value === k ? ' gt-scalepicker__opt--active' : ''}`}
          onClick={() => onChange?.(k)}
        >
          <span className="gt-scalepicker__name">{k}</span>
          <span className="gt-scalepicker__preview">{ESTIMATE_SCALES[k].join(' · ')}</span>
        </button>
      ))}
    </div>
  );
}

/** Chip row of the active scale's point values. */
export function PointPicker({ scale, value, onChange }: { scale: EstimateScale; value?: number | null; onChange?: (points: number) => void }) {
  return (
    <div className="gt-pointpicker" role="radiogroup" aria-label="Points">
      {ESTIMATE_SCALES[scale].map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={`gt-pointpicker__chip${value === v ? ' gt-pointpicker__chip--active' : ''}`}
          onClick={() => onChange?.(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
