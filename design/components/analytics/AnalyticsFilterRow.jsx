import React from 'react';
import { AnalyticsIcon } from './ChartLegend.jsx';
import { fmtRange } from './ChartTooltip.jsx';

export const RANGE_PRESETS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'class', label: 'Class to date' },
  { value: 'all', label: 'All' },
];

function isoDaysAgo(days, from = new Date()) {
  const d = new Date(from); d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * The one filter row (.gt-filter) above everything it scopes. Institution Select
 * only when the viewer may see several; class Select ("All classes" first); range
 * chips 7d · 30d · 90d · Class to date · All · Custom (32px, radius 20, active =
 * solid green). "Class to date" is enabled only with a class selected. "Custom"
 * opens a popover (From, To, Apply); once applied the chip reads
 * "Custom: Sep 1 – Sep 30". While Apply is disabled the panel's last row says why
 * ("Dates must fall between 2000 and 2100" · "A range may span at most 2 years" ·
 * "To must be on or after From"). Every control is disabled during the very first load.
 * State belongs in the URL.
 */
export function AnalyticsFilterRow({
  institutions = [],
  institutionId,
  classes = [],
  classId = '',
  range = { preset: '30d' },
  onChange,
  disabled = false,
  today,
  className = '',
}) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(range.from || isoDaysAgo(30, today));
  const [to, setTo] = React.useState(range.to || isoDaysAgo(0, today));
  const popRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    const down = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, [open]);

  const emit = (patch) => onChange && onChange({ institutionId, classId, range, ...patch });
  const pick = (preset) => emit({ range: { preset } });
  const applyCustom = () => { emit({ range: { preset: 'custom', from, to } }); setOpen(false); };
  const customLabel = range.preset === 'custom' && range.from && range.to ? `Custom: ${fmtRange(range.from, range.to)}` : 'Custom';
  // Why Apply is disabled — shown beside it in the panel's last row (copy verbatim from the revision block).
  const reason = (() => {
    if (!from || !to) return null;
    const y1 = Number(from.slice(0, 4)), y2 = Number(to.slice(0, 4));
    if (y1 < 2000 || y1 > 2100 || y2 < 2000 || y2 > 2100) return 'Dates must fall between 2000 and 2100';
    if (to < from) return 'To must be on or after From';
    if ((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000 + 1 > 731) return 'A range may span at most 2 years';
    return null;
  })();

  const select = (label, value, onSelect, children) => (
    <div className="gt-filter__field">
      <span className="gt-filter__label">{label}</span>
      <span className="gt-filter__select gt-select">
        <select className="gt-select__control" value={value} onChange={onSelect} disabled={disabled} aria-label={label}>{children}</select>
        <AnalyticsIcon name="chevron-down" size={14} className="gt-select__chevron" />
      </span>
    </div>
  );

  return (
    <div className={['gt-filter', disabled ? 'gt-filter--disabled' : '', className].filter(Boolean).join(' ')} role="group" aria-label="Filters" aria-disabled={disabled || undefined}>
      {institutions.length > 1 && select('Institution', institutionId || '', (e) => emit({ institutionId: e.target.value }),
        institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>))}
      {select('Class', classId || '', (e) => emit({ classId: e.target.value, range: range.preset === 'class' && !e.target.value ? { preset: '30d' } : range }),
        [<option key="" value="">All classes</option>, ...classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)])}
      <div className="gt-filter__field">
        <span className="gt-filter__label">Range</span>
        <div className="gt-filter__chips" role="group" aria-label="Date range">
          {RANGE_PRESETS.map((p) => {
            const needsClass = p.value === 'class' && !classId;
            const active = range.preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                className={['gt-filter__chip', active ? 'gt-filter__chip--active' : ''].filter(Boolean).join(' ')}
                aria-pressed={active}
                disabled={disabled || needsClass}
                title={needsClass ? 'Select a class first' : undefined}
                onClick={() => pick(p.value)}
              >
                {p.label}
              </button>
            );
          })}
          <span className="gt-filter__custom" ref={popRef}>
            <button
              type="button"
              className={['gt-filter__chip', range.preset === 'custom' ? 'gt-filter__chip--active' : ''].filter(Boolean).join(' ')}
              aria-pressed={range.preset === 'custom'}
              aria-haspopup="dialog"
              aria-expanded={open}
              disabled={disabled}
              onClick={() => setOpen((o) => !o)}
            >
              <AnalyticsIcon name="calendar" size={13} />
              {customLabel}
            </button>
            {open && (
              <div className="gt-popover gt-popover--bottom gt-popover--start gt-filter__pop" role="dialog" aria-label="Custom range">
                <span className="gt-filter__pop-title">Custom range</span>
                <div className="gt-filter__dates">
                  <label className="gt-filter__date">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                  <label className="gt-filter__date">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                </div>
                <div className="gt-filter__foot">
                  {reason && <span className="gt-filter__reason" role="status">{reason}</span>}
                  <button type="button" className="gt-button gt-button--ghost gt-button--sm" onClick={() => setOpen(false)}><span className="gt-button__label">Cancel</span></button>
                  <button type="button" className="gt-button gt-button--primary gt-button--sm gt-filter__apply" onClick={applyCustom} disabled={!from || !to || !!reason}><span className="gt-button__label">Apply</span></button>
                </div>
              </div>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
