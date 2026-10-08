import { useRef, useState } from 'react';
import { Popover } from '@/components/Popover/Popover';
import DatePickerField from '@features/app/components/Fields/DatePickerField';
import type { AnalyticsRangePreset } from '@/lib/api/types';
import type { AnalyticsFilters } from '../hooks/useAnalyticsDashboard';
import { rangeLabel } from '../utils/analyticsFormat';

export interface AnalyticsFilterRowProps {
  institutions: { id: string; name: string }[];
  institutionId: string | null;
  classes: { id: string; label: string }[];
  classId: string | null;
  range: { preset: AnalyticsRangePreset; from: string | null; to: string | null };
  onChange: (patch: Partial<AnalyticsFilters>) => void;
  disabled?: boolean;
}

const CHIPS: { preset: AnalyticsRangePreset; label: string }[] = [
  { preset: '7d', label: '7d' }, { preset: '30d', label: '30d' }, { preset: '90d', label: '90d' },
  { preset: 'class', label: 'Class to date' }, { preset: 'all', label: 'All' },
];

/** The one filter row (brief §3.2): institution (when several), class, range chips, a Custom popover. State lives in the URL via onChange. */
export function AnalyticsFilterRow({ institutions, institutionId, classes, classId, range, onChange, disabled = false }: AnalyticsFilterRowProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(range.from ?? '');
  const [to, setTo] = useState(range.to ?? '');
  // The date fields portal their calendars to <body>, so the Popover's outside-press check (DOM containment) takes a
  // press on a day for an outside press and would close the panel under it. React still bubbles that press through the
  // panel, which marks it; the close it triggers is skipped.
  const calendarPress = useRef(false);
  const closeCustom = () => {
    if (calendarPress.current) calendarPress.current = false;
    else setCustomOpen(false);
  };
  const customLabel = range.preset === 'custom' && range.from && range.to ? `Custom: ${rangeLabel(range.from, range.to)}` : 'Custom';
  const canApply = from !== '' && to !== '' && from <= to; // ISO dates compare as strings; the backend refuses a range that ends before it starts
  const apply = () => {
    if (!canApply) return;
    onChange({ window: 'custom', from, to });
    setCustomOpen(false);
  };
  return (
    <div className="gt-filter">
      {institutions.length > 1 ? (
        <label className="gt-filter__field">
          <span className="gt-filter__label">Institution</span>
          <select className="gt-filter__select" value={institutionId ?? ''} disabled={disabled} onChange={(e) => onChange({ institutionId: e.target.value, classId: null })}>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className="gt-filter__field">
        <span className="gt-filter__label">Class</span>
        <select className="gt-filter__select" value={classId ?? ''} disabled={disabled} onChange={(e) => onChange({ classId: e.target.value || null })}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <div className="gt-filter__chips" role="radiogroup" aria-label="Range">
        {CHIPS.map((c) => (
          <button key={c.preset} type="button" role="radio" aria-checked={range.preset === c.preset} className={`gt-filter__chip${range.preset === c.preset ? ' gt-filter__chip--active' : ''}`} disabled={disabled || (c.preset === 'class' && !classId)} onClick={() => onChange({ window: c.preset })}>
            {c.label}
          </button>
        ))}
        <Popover
          open={customOpen}
          onClose={closeCustom}
          align="end"
          anchor={
            <button type="button" role="radio" aria-checked={range.preset === 'custom'} className={`gt-filter__chip${range.preset === 'custom' ? ' gt-filter__chip--active' : ''}`} disabled={disabled} onClick={() => setCustomOpen((o) => !o)}>
              {customLabel}
            </button>
          }
        >
          <div className="gt-filter__custom" onMouseDown={(e) => { calendarPress.current = !e.currentTarget.contains(e.target as Node); }}>
            <DatePickerField label="From" value={from} onChange={setFrom} />
            <DatePickerField label="To" value={to} onChange={setTo} disabledBefore={from ? new Date(`${from}T00:00:00`) : undefined} />
            <button type="button" className="gt-filter__apply" onClick={apply} disabled={!canApply}>Apply</button>
          </div>
        </Popover>
      </div>
    </div>
  );
}
