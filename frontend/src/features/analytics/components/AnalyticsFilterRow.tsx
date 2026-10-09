import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Popover } from '@/components/Popover/Popover';
import DatePickerField from '@features/app/components/Fields/DatePickerField';
import type { AnalyticsRangePreset } from '@/lib/api/types';
import type { AnalyticsFilters } from '../hooks/useAnalyticsDashboard';
import { rangeLabel } from '../utils/analyticsFormat';
import { customRangeProblem } from '../utils/customRange';

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
/** The radio group in DOM order: the preset chips, then Custom. */
const ORDER: AnalyticsRangePreset[] = [...CHIPS.map((c) => c.preset), 'custom'];
const STEP: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** The one filter row (brief §3.2): institution (when several), class, range chips, a Custom popover. State lives in the URL via onChange. */
export function AnalyticsFilterRow({ institutions, institutionId, classes, classId, range, onChange, disabled = false }: AnalyticsFilterRowProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(range.from ?? '');
  const [to, setTo] = useState(range.to ?? '');
  const chipRefs = useRef<Partial<Record<AnalyticsRangePreset, HTMLButtonElement | null>>>({});
  // The date fields portal their calendars to <body>, so the Popover's outside-press check (DOM containment) takes a
  // press on a day for an outside press and would close the panel under it. React still bubbles that press through the
  // panel, which marks it; the close it triggers is skipped.
  const calendarPress = useRef(false);
  const closeCustom = () => {
    if (calendarPress.current) calendarPress.current = false;
    else setCustomOpen(false);
  };
  // Escape sends focus back to the Custom chip; an outside press does not. The Popover takes Escape at document capture
  // and closes through onClose, which an outside press calls too, so Escape is caught first, on window, while the panel is open.
  useEffect(() => {
    if (!customOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setCustomOpen(false);
      chipRefs.current.custom?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [customOpen]);
  const customLabel = range.preset === 'custom' && range.from && range.to ? `Custom: ${rangeLabel(range.from, range.to)}` : 'Custom';
  // The backend's range rules, with the one a draft breaks named under the fields: a refused range would otherwise reach
  // the URL and answer 422 on every poll.
  const problem = customRangeProblem(from, to);
  const canApply = from !== '' && to !== '' && problem === null;
  const apply = () => {
    if (!canApply) return;
    onChange({ window: 'custom', from, to });
    setCustomOpen(false);
    chipRefs.current.custom?.focus();
  };
  const toggleCustom = () => {
    if (!customOpen) {
      // each opening starts from the applied range, not from an earlier draft that was never applied
      setFrom(range.from ?? '');
      setTo(range.to ?? '');
    }
    setCustomOpen(!customOpen);
  };
  const pickFrom = (value: string) => {
    setFrom(value);
    if (to !== '' && value > to) setTo(''); // that To is no longer a choice: clear it rather than leave Apply disabled without a reason
  };

  // The WAI-ARIA radio group: one tab stop (the checked chip, else the first enabled one; Custom while its panel is open),
  // and the arrow keys, Home and End move between the enabled chips, checking each preset they land on. A custom window
  // needs dates, so landing on Custom only focuses it; Space or Enter opens its panel, as a click does.
  const isDisabled = (preset: AnalyticsRangePreset) => disabled || (preset === 'class' && !classId);
  const enabled = ORDER.filter((preset) => !isDisabled(preset));
  const tabStop = customOpen && !disabled ? 'custom' : enabled.includes(range.preset) ? range.preset : enabled[0];
  const onChipKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, preset: AnalyticsRangePreset) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return; // modified keys stay the browser's (Alt+Left is Back)
    const at = enabled.indexOf(preset);
    const step = STEP[e.key];
    const next = step ? enabled[(at + step + enabled.length) % enabled.length] : e.key === 'Home' ? enabled[0] : e.key === 'End' ? enabled[enabled.length - 1] : undefined;
    if (next === undefined) return;
    e.preventDefault();
    if (next === preset) return;
    setCustomOpen(false); // as a press on another chip would
    chipRefs.current[next]?.focus();
    if (next !== 'custom') onChange({ window: next });
  };
  const chipProps = (preset: AnalyticsRangePreset) => ({
    type: 'button' as const,
    role: 'radio',
    'aria-checked': range.preset === preset,
    className: `gt-filter__chip${range.preset === preset ? ' gt-filter__chip--active' : ''}`,
    disabled: isDisabled(preset),
    tabIndex: preset === tabStop ? 0 : -1,
  });
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
          <button key={c.preset} {...chipProps(c.preset)} ref={(el) => { chipRefs.current[c.preset] = el; }} onKeyDown={(e) => onChipKeyDown(e, c.preset)} onClick={() => onChange({ window: c.preset })}>
            {c.label}
          </button>
        ))}
        <Popover
          open={customOpen}
          onClose={closeCustom}
          align="end"
          anchor={
            <button {...chipProps('custom')} ref={(el) => { chipRefs.current.custom = el; }} onKeyDown={(e) => onChipKeyDown(e, 'custom')} onClick={toggleCustom}>
              {customLabel}
            </button>
          }
        >
          <div className="gt-filter__custom" onMouseDown={(e) => { calendarPress.current = !e.currentTarget.contains(e.target as Node); }}>
            <DatePickerField label="From" value={from} onChange={pickFrom} />
            <DatePickerField label="To" value={to} onChange={setTo} disabledBefore={from ? new Date(`${from}T00:00:00`) : undefined} />
            <div className="gt-filter__foot">
              {/* Always present, so a reason that appears is announced. */}
              <p className="gt-filter__reason" role="status">{problem}</p>
              <button type="button" className="gt-filter__apply" onClick={apply} disabled={!canApply}>Apply</button>
            </div>
          </div>
        </Popover>
      </div>
    </div>
  );
}
